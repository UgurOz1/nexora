import { PrismaService } from '../src/prisma/prisma.service';
import { RateLimiter } from '../src/rate-limit/rate-limiter.service';
import { REDIS } from '../src/redis/redis.module';
import {
  apiFor,
  createTestApp,
  PASSWORD,
  type TestContext,
  type TestOrg,
  type TestUser,
} from './helpers';

interface AuditItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  actor: { id: string; name: string } | null;
}
interface AuditPage {
  items: AuditItem[];
  nextCursor: string | null;
}

describe('security (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let prisma: PrismaService;
  let limiter: RateLimiter;
  let ada: TestUser; // OWNER of Acme
  let adm: TestUser; // ADMIN
  let max: TestUser; // MANAGER
  let mia: TestUser; // MEMBER
  let grace: TestUser; // OWNER of Globex
  let acme: TestOrg;
  let globex: TestOrg;

  const body = <T>(res: { body: unknown }) => res.body as T;
  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;
  const logs = async (user: TestUser, org: TestOrg, query = '') =>
    body<AuditPage>(await api.get(user, path(org, `/audit-logs${query}`)).expect(200));
  const rows = (where: object) =>
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    prisma = ctx.app.get(PrismaService);
    limiter = ctx.app.get(RateLimiter);
    [ada, adm, max, mia, grace] = await Promise.all(
      ['ada', 'adm', 'max', 'mia', 'grace'].map((n) => ctx.signUp(n)),
    );
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, adm, 'ADMIN');
    await api.join(ada, acme, max, 'MANAGER');
    await api.join(ada, acme, mia, 'MEMBER');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('security headers', () => {
    it('are set, and the server does not announce what it runs on', async () => {
      const res = await ctx.http().get('/api/v1/auth/me');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('rate limiter', () => {
    const bucket = { capacity: 3, refillPerSecond: 10 };
    let n = 0;
    const key = () => `unit:${Date.now()}:${++n}`;

    it('lets a burst through, then says how long to wait', async () => {
      const k = key();

      const results = [];
      for (let i = 0; i < 4; i++) results.push(await limiter.consume(k, bucket));

      expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
      expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
      expect(results[3].retryAfterSeconds).toBe(1);
    });

    it('refills over time (no cliff at a window edge)', async () => {
      const k = key();
      for (let i = 0; i < 3; i++) await limiter.consume(k, bucket);
      expect((await limiter.consume(k, bucket)).allowed).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 250)); // 10 tokens a second: 2 or 3 back

      expect((await limiter.consume(k, bucket)).allowed).toBe(true);
    });

    it('is exact under concurrent requests (the script is atomic)', async () => {
      const k = key();

      const results = await Promise.all(
        Array.from({ length: 25 }, () =>
          limiter.consume(k, { capacity: 5, refillPerSecond: 0.001 }),
        ),
      );

      expect(results.filter((r) => r.allowed)).toHaveLength(5);
    });

    it('keeps separate budgets for separate keys', async () => {
      const [a, b] = [key(), key()];
      for (let i = 0; i < 3; i++) await limiter.consume(a, bucket);

      expect((await limiter.consume(a, bucket)).allowed).toBe(false);
      expect((await limiter.consume(b, bucket)).allowed).toBe(true);
    });

    it('lets requests through when Redis fails, instead of taking the API down', async () => {
      const redis = ctx.app.get<{ eval: (...args: unknown[]) => unknown }>(REDIS);
      const original = redis.eval.bind(redis);
      redis.eval = () => Promise.reject(new Error('Redis is down'));
      try {
        const result = await limiter.consume(key(), bucket);
        expect(result.allowed).toBe(true);
      } finally {
        redis.eval = original;
      }
    });
  });

  describe('rate limits on the API', () => {
    beforeAll(() => {
      limiter.enabled = true;
      // Behind a proxy that sets X-Forwarded-For, every request can come from a different IP.
      (ctx.app.getHttpAdapter().getInstance() as { set: (k: string, v: number) => void }).set(
        'trust proxy',
        1,
      );
    });
    afterAll(() => {
      limiter.enabled = false;
      (ctx.app.getHttpAdapter().getInstance() as { set: (k: string, v: boolean) => void }).set(
        'trust proxy',
        false,
      );
    });

    const login = (email: string, ip: string, password = 'wrong password') =>
      ctx.http().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password });

    it('stops password guessing from one address after 5 tries', async () => {
      const ip = '10.1.0.1';
      for (let i = 0; i < 5; i++) {
        await login(`nobody${i}@example.com`, ip).expect(401);
      }

      const blocked = await login('nobody9@example.com', ip).expect(429);

      expect((blocked.body as { message: string }).message).toMatch(/Too many requests/);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      // Another address is not affected.
      await login('nobody9@example.com', '10.1.0.2').expect(401);
    });

    it('also counts per account, so one account cannot be attacked from many addresses', async () => {
      const victim = `victim.${Date.now()}@example.com`;
      for (let i = 0; i < 5; i++) {
        await login(victim, `10.2.0.${i + 1}`).expect(401);
      }

      await login(victim, '10.2.0.99').expect(429);
      // The same address trying a different account is fine.
      await login('someone.else@example.com', '10.2.0.99').expect(401);
    });

    it('does not let the right password skip the queue once the limit is hit', async () => {
      const ip = '10.3.0.1';
      for (let i = 0; i < 5; i++) await login(ada.email, ip).expect(401);

      await login(ada.email, ip, PASSWORD).expect(429);
    });

    it('limits e-mail endpoints and answers the same for known and unknown addresses', async () => {
      const ip = '10.4.0.1';
      const forgot = (email: string) =>
        ctx.http().post('/api/v1/auth/forgot-password').set('X-Forwarded-For', ip).send({ email });

      await forgot(ada.email).expect(202);
      await forgot('unknown@example.com').expect(202);
      await forgot(ada.email).expect(202);
      await forgot(ada.email).expect(429); // 4th within the hour
    });

    it('leaves normal traffic alone and reports what is left', async () => {
      const res = await api.get(ada, '/auth/me').expect(200);

      expect(res.headers['ratelimit-limit']).toBe('120');
      expect(Number(res.headers['ratelimit-remaining'])).toBeGreaterThan(100);
    });
  });

  describe('audit log', () => {
    it('records sign-ins with address and browser, and failed ones with the address that was tried', async () => {
      const email = `audit.${Date.now()}@example.com`;
      await ctx
        .http()
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, name: 'Audit' })
        .expect(201);
      await ctx
        .http()
        .post('/api/v1/auth/login')
        .set('User-Agent', 'TestBrowser/1.0')
        .send({ email, password: PASSWORD })
        .expect(200);
      await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'Wrong password 123' })
        .expect(401);
      // A malformed request is not a failed sign-in.
      await ctx
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const own = await rows({ actorId: user.id });
      expect(own.map((r) => r.action)).toEqual(['auth.registered', 'auth.login']);
      expect(own[1]).toMatchObject({ userAgent: 'TestBrowser/1.0', organizationId: null });
      expect(own[1].ip).toBeTruthy();

      const failed = await prisma.auditLog.findMany({ where: { action: 'auth.login_failed' } });
      const mine = failed.filter((r) => (r.metadata as { email?: string } | null)?.email === email);
      expect(mine).toHaveLength(1);
      expect(mine[0].actorId).toBeNull();
      // The malformed request (400) left no "failed sign-in" behind.
      expect(
        failed.filter((r) => (r.metadata as { email?: string } | null)?.email === 'not-an-email'),
      ).toHaveLength(0);
    });

    it('never stores a password', async () => {
      const secret = 'Sup3r secret password!';
      const email = `secret.${Date.now()}@example.com`;
      await ctx.http().post('/api/v1/auth/login').send({ email, password: secret }).expect(401);
      await ctx
        .http()
        .post('/api/v1/auth/reset-password')
        .send({ token: 'x'.repeat(30), password: secret });

      const all = await prisma.auditLog.findMany();

      expect(JSON.stringify(all)).not.toContain(secret);
    });

    it('records who invited, changed and removed whom, inside the organization', async () => {
      const org = await api.createOrg(ada, 'Audit Co');
      const [leo] = [await ctx.signUp('leo')];
      await api
        .post(ada, path(org, '/invitations'), { email: leo.email, role: 'MEMBER' })
        .expect(201);
      await api
        .post(leo, '/invitations/accept', { token: ctx.mailToken(leo.email, 'invited you') })
        .expect(200);
      await api.patch(ada, path(org, `/members/${leo.id}`), { role: 'MANAGER' }).expect(200);
      await api.del(ada, path(org, `/members/${leo.id}`)).expect(204);

      const feed = (await logs(ada, org, '?limit=50')).items.map((i) => i.action);

      expect(feed).toEqual([
        'member.removed',
        'member.role_changed',
        'invitation.accepted',
        'member.invited',
        'organization.created',
      ]);
      const items = (await logs(ada, org, '?limit=50')).items;
      expect(items.find((i) => i.action === 'member.role_changed')).toMatchObject({
        targetType: 'user',
        targetId: leo.id,
        metadata: { newRole: 'MANAGER' },
        actor: { id: ada.id },
      });
      expect(items.find((i) => i.action === 'member.invited')?.metadata).toEqual({
        email: leo.email,
        role: 'MEMBER',
      });
      expect(items.find((i) => i.action === 'member.removed')?.metadata).toEqual({ left: false });
    });

    it('does not record requests that were refused or did nothing', async () => {
      const before = await prisma.auditLog.count({ where: { organizationId: acme.id } });

      await api.patch(mia, path(acme, `/members/${max.id}`), { role: 'ADMIN' }).expect(403); // a member
      await api.patch(adm, path(acme, `/members/${ada.id}`), { role: 'MEMBER' }).expect(403); // the owner

      expect(await prisma.auditLog.count({ where: { organizationId: acme.id } })).toBe(before);
    });

    it('keeps the record of a deleted organization, outside the organization', async () => {
      const org = await api.createOrg(ada, 'Short Lived');
      await api.del(ada, path(org, '')).expect(204);

      const deleted = await prisma.auditLog.findMany({ where: { targetId: org.id } });

      // "created" went with the organization; "deleted" stayed.
      expect(deleted.map((r) => r.action)).toEqual(['organization.deleted']);
      expect(deleted[0]).toMatchObject({ organizationId: null, actorId: ada.id });
      // Its other entries went with it.
      expect(await prisma.auditLog.count({ where: { organizationId: org.id } })).toBe(0);
    });

    it('records project deletions', async () => {
      const project = body<{ id: string }>(
        await api.post(max, path(acme, '/projects'), { name: 'Doomed' }).expect(201),
      );
      await api.del(adm, path(acme, `/projects/${project.id}`)).expect(204);

      const [entry] = (await logs(ada, acme, '?action=project.deleted')).items;

      expect(entry).toMatchObject({
        targetType: 'project',
        targetId: project.id,
        actor: { id: adm.id },
      });
    });

    it('is not lost when the write to the database fails: the request still succeeds', async () => {
      const spy = jest
        .spyOn(prisma.auditLog, 'create')
        .mockRejectedValueOnce(new Error('db hiccup'));
      const project = body<{ id: string }>(
        await api.post(max, path(acme, '/projects'), { name: 'Quiet' }).expect(201),
      );

      await api.del(adm, path(acme, `/projects/${project.id}`)).expect(204);

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('reading the audit log', () => {
    it('is for owners and admins only', async () => {
      await api.get(ada, path(acme, '/audit-logs')).expect(200);
      await api.get(adm, path(acme, '/audit-logs')).expect(200);
      await api.get(max, path(acme, '/audit-logs')).expect(403);
      await api.get(mia, path(acme, '/audit-logs')).expect(403);
    });

    it('is invisible to other companies, and shows only its own', async () => {
      await api.get(grace, path(acme, '/audit-logs')).expect(404);
      const theirs = await logs(grace, globex, '?limit=100');

      expect(theirs.items.every((i) => i.action === 'organization.created')).toBe(true);
      const acmeIds = new Set((await logs(ada, acme, '?limit=100')).items.map((i) => i.id));
      expect(theirs.items.some((i) => acmeIds.has(i.id))).toBe(false);
    });

    it('filters by action and by person, and paginates newest first', async () => {
      const all = await logs(ada, acme, '?limit=100');
      expect(all.items.length).toBeGreaterThan(3);

      const projectsOnly = await logs(ada, acme, '?action=project.deleted');
      expect(projectsOnly.items.every((i) => i.action === 'project.deleted')).toBe(true);

      const byAdm = await logs(ada, acme, `?actorId=${adm.id}&limit=100`);
      expect(byAdm.items.length).toBeGreaterThan(0);
      expect(byAdm.items.every((i) => i.actor?.id === adm.id)).toBe(true);

      const page1 = await logs(ada, acme, '?limit=2');
      const page2 = await logs(ada, acme, `?limit=2&cursor=${page1.nextCursor}`);
      expect([...page1.items, ...page2.items].map((i) => i.id)).toEqual(
        all.items.slice(0, 4).map((i) => i.id),
      );
    });

    it('rejects unknown filters', async () => {
      await api.get(ada, path(acme, '/audit-logs?action=made.up')).expect(400);
      await api.get(ada, path(acme, '/audit-logs?actorId=nope')).expect(400);
    });
  });
});
