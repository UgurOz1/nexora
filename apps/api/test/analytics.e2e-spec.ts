import { PrismaService } from '../src/prisma/prisma.service';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

interface Overview {
  range: { days: number; from: string; generatedAt: string };
  totals: {
    byStatus: Record<'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE', number>;
    overdue: number;
    dueSoon: number;
    completed: number;
    created: number;
    medianCycleHours: number | null;
  };
  daily: { date: string; completed: number; created: number }[];
  projects: {
    id: string;
    name: string;
    department: string | null;
    open: number;
    done: number;
    overdue: number;
    completed: number;
  }[];
  departments: {
    department: string | null;
    projects: number;
    open: number;
    overdue: number;
    completed: number;
  }[];
}
interface Team {
  members: {
    userId: string;
    name: string;
    role: string;
    open: number;
    overdue: number;
    completed: number;
    medianCycleHours: number | null;
  }[];
  unassigned: { open: number; overdue: number };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const METRICS_TOKEN = 'e2e-metrics-token-0123456789';

describe('analytics (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let prisma: PrismaService;
  let ada: TestUser; // OWNER of every organization below
  let mia: TestUser; // MEMBER
  let max: TestUser; // MANAGER
  let grace: TestUser; // OWNER of another organization

  const body = <T>(res: { body: unknown }) => res.body as T;
  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;

  let orgCount = 0;
  // A fresh organization per test, so counts are exactly what the test created.
  const freshOrg = async () => {
    const org = await api.createOrg(ada, `Analytics ${++orgCount}`);
    await api.join(ada, org, mia, 'MEMBER');
    await api.join(ada, org, max, 'MANAGER');
    return org;
  };
  const project = async (org: TestOrg, name: string, extra: object = {}) =>
    body<{ id: string }>(
      await api.post(ada, path(org, '/projects'), { name, ...extra }).expect(201),
    );
  const task = async (org: TestOrg, p: { id: string }, extra: object = {}) =>
    body<{ id: string }>(
      await api
        .post(ada, path(org, `/projects/${p.id}/tasks`), { title: 'Work', ...extra })
        .expect(201),
    );
  const move = (org: TestOrg, id: string, status: string) =>
    api.post(ada, path(org, `/tasks/${id}/move`), { status }).expect(200);
  const overview = async (user: TestUser, org: TestOrg, query = '') =>
    body<Overview>(await api.get(user, path(org, `/analytics/overview${query}`)).expect(200));
  const team = async (user: TestUser, org: TestOrg) =>
    body<Team>(await api.get(user, path(org, '/analytics/team')).expect(200));
  const completedAt = async (id: string) =>
    (await prisma.task.findUniqueOrThrow({ where: { id }, select: { completedAt: true } }))
      .completedAt;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    prisma = ctx.app.get(PrismaService);
    [ada, mia, max, grace] = await Promise.all(
      ['ada', 'mia', 'max', 'grace'].map((n) => ctx.signUp(n)),
    );
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('completion time (database trigger)', () => {
    it('is set when a task becomes DONE, kept while it stays DONE and cleared when it leaves', async () => {
      const org = await freshOrg();
      const p = await project(org, 'P');
      const t = await task(org, p);
      expect(await completedAt(t.id)).toBeNull();

      await move(org, t.id, 'DONE');
      const done = await completedAt(t.id);
      expect(done).toBeInstanceOf(Date);

      // Editing something else does not move the completion time.
      await api.patch(ada, path(org, `/tasks/${t.id}`), { title: 'Renamed' }).expect(200);
      expect(await completedAt(t.id)).toEqual(done);

      await move(org, t.id, 'IN_PROGRESS');
      expect(await completedAt(t.id)).toBeNull();
    });

    it('is set for a task created as DONE, and for a status changed by plain SQL', async () => {
      const org = await freshOrg();
      const p = await project(org, 'P');
      const created = await task(org, p, { status: 'DONE' });
      expect(await completedAt(created.id)).toBeInstanceOf(Date);

      const other = await task(org, p);
      await prisma.$executeRaw`UPDATE "tasks" SET "status" = 'DONE' WHERE "id" = ${other.id}`;
      expect(await completedAt(other.id)).toBeInstanceOf(Date);
    });
  });

  describe('overview', () => {
    it('counts tasks by status, overdue, due soon, finished and created', async () => {
      const org = await freshOrg();
      const p = await project(org, 'Website', { department: 'Marketing' });
      const past = new Date(Date.now() - 2 * DAY).toISOString();
      const soon = new Date(Date.now() + 2 * DAY).toISOString();
      const later = new Date(Date.now() + 30 * DAY).toISOString();

      await task(org, p, { dueDate: past }); // TODO, overdue
      await task(org, p, { status: 'IN_PROGRESS', dueDate: soon }); // due soon
      await task(org, p, { status: 'IN_REVIEW', dueDate: later });
      await task(org, p, { status: 'DONE', dueDate: past }); // done: never overdue
      const deleted = await task(org, p, { dueDate: past });
      await api.del(ada, path(org, `/tasks/${deleted.id}`)).expect(204);

      const result = await overview(mia, org);
      expect(result.totals).toEqual({
        byStatus: { TODO: 1, IN_PROGRESS: 1, IN_REVIEW: 1, DONE: 1 },
        overdue: 1,
        dueSoon: 1,
        completed: 1,
        created: 4,
        medianCycleHours: expect.any(Number) as number,
      });
      expect(result.projects).toEqual([
        {
          id: p.id,
          name: 'Website',
          department: 'Marketing',
          open: 3,
          done: 1,
          overdue: 1,
          completed: 1,
        },
      ]);
      expect(result.departments).toEqual([
        { department: 'Marketing', projects: 1, open: 3, overdue: 1, completed: 1 },
      ]);
    });

    it('has one entry per day of the range, zeros included, and today holds the new work', async () => {
      const org = await freshOrg();
      const p = await project(org, 'P');
      const t = await task(org, p);
      await move(org, t.id, 'DONE');

      const result = await overview(mia, org, '?days=7');
      expect(result.range.days).toBe(7);
      expect(result.daily).toHaveLength(7);
      const today = new Date().toISOString().slice(0, 10);
      expect(result.daily.at(-1)).toEqual({ date: today, completed: 1, created: 1 });
      expect(result.daily.slice(0, -1).every((d) => d.completed === 0 && d.created === 0)).toBe(
        true,
      );
      expect(result.range.from.slice(0, 10)).toBe(result.daily[0].date);
    });

    it('measures the median time from creation to completion, and leaves out older work', async () => {
      const org = await freshOrg();
      const p = await project(org, 'P');
      const [a, b, c, old] = await Promise.all([1, 2, 3, 4].map(() => task(org, p)));
      const now = Date.now();
      // Finished 2, 4 and 30 hours after being created -> median 4. `old` finished 40 days ago.
      const set = (id: string, createdAt: number, doneAt: number) =>
        prisma.task.update({
          where: { id },
          data: { status: 'DONE', createdAt: new Date(createdAt), completedAt: new Date(doneAt) },
        });
      await set(a.id, now - 2 * HOUR, now);
      await set(b.id, now - 5 * HOUR, now - HOUR);
      await set(c.id, now - 31 * HOUR, now - HOUR);
      await set(old.id, now - 41 * DAY, now - 40 * DAY);

      const result = await overview(mia, org);
      expect(result.totals.completed).toBe(3);
      expect(result.totals.medianCycleHours).toBe(4);
      expect((await overview(mia, org, '?days=90')).totals.completed).toBe(4);
    });

    it('can be limited to one project; projects of deleted projects are gone', async () => {
      const org = await freshOrg();
      const one = await project(org, 'One');
      const two = await project(org, 'Two');
      const gone = await project(org, 'Gone');
      await task(org, one);
      await task(org, two);
      await task(org, two);
      await task(org, gone);
      await api.del(ada, path(org, `/projects/${gone.id}`)).expect(204);

      const all = await overview(mia, org);
      expect(all.totals.byStatus.TODO).toBe(3);
      expect(all.projects.map((p) => p.name)).toEqual(['Two', 'One']); // most open work first

      const onlyOne = await overview(mia, org, `?projectId=${one.id}`);
      expect(onlyOne.totals.byStatus.TODO).toBe(1);
      expect(onlyOne.projects.map((p) => p.name)).toEqual(['One']);
    });

    it('never counts another organization, not even through its project id', async () => {
      const mine = await freshOrg();
      await task(mine, await project(mine, 'Mine'));
      const theirs = await api.createOrg(grace, 'Theirs');
      const theirProject = body<{ id: string }>(
        await api.post(grace, path(theirs, '/projects'), { name: 'Secret' }).expect(201),
      );
      await api
        .post(grace, path(theirs, `/projects/${theirProject.id}/tasks`), { title: 'Secret' })
        .expect(201);

      const result = await overview(mia, mine);
      expect(result.totals.byStatus.TODO).toBe(1);
      expect(result.projects.map((p) => p.name)).toEqual(['Mine']);

      const probe = await overview(mia, mine, `?projectId=${theirProject.id}`);
      expect(probe.totals.byStatus.TODO).toBe(0);
      expect(probe.projects).toEqual([]);

      // And an outsider cannot read the dashboard at all.
      await api.get(grace, path(mine, '/analytics/overview')).expect(404);
    });

    it('accepts only the fixed ranges and a valid project id', async () => {
      const org = await freshOrg();
      await api.get(mia, path(org, '/analytics/overview?days=14')).expect(400);
      await api.get(mia, path(org, '/analytics/overview?projectId=nope')).expect(400);
      await api.get(mia, path(org, '/analytics/overview?days=90')).expect(200);
    });
  });

  describe('team', () => {
    it('is for MANAGER and above', async () => {
      const org = await freshOrg();
      await api.get(mia, path(org, '/analytics/team')).expect(403);
      await api.get(max, path(org, '/analytics/team')).expect(200);
      await api.get(ada, path(org, '/analytics/team')).expect(200);
    });

    it('lists every member with their work, and work nobody current owns as unassigned', async () => {
      const org = await freshOrg();
      const p = await project(org, 'P');
      const past = new Date(Date.now() - DAY).toISOString();
      await task(org, p, { assigneeId: mia.id, dueDate: past }); // mia: open, overdue
      const doneByMia = await task(org, p, { assigneeId: mia.id });
      await move(org, doneByMia.id, 'DONE');
      await task(org, p, { assigneeId: max.id }); // max leaves below
      await task(org, p); // nobody

      await api.del(ada, path(org, `/members/${max.id}`)).expect(204);

      const result = await team(ada, org);
      const byName = Object.fromEntries(result.members.map((m) => [m.name, m]));
      expect(Object.keys(byName).sort()).toEqual(['ada', 'mia']);
      expect(byName.mia).toMatchObject({ role: 'MEMBER', open: 1, overdue: 1, completed: 1 });
      expect(byName.ada).toMatchObject({ role: 'OWNER', open: 0, completed: 0 });
      expect(byName.ada.medianCycleHours).toBeNull();
      expect(result.members[0].name).toBe('mia'); // most finished work first
      expect(result.unassigned).toEqual({ open: 2, overdue: 0 });
    });
  });

  describe('cache', () => {
    it('answers from the cache until the organization changes through the API', async () => {
      const org = await freshOrg();
      const p = await project(org, 'Cached');
      const t = await task(org, p);
      const first = await overview(mia, org);
      expect(first.totals.byStatus.TODO).toBe(1);

      // A change behind the API's back is not seen: proof the second answer is the stored one.
      await prisma.task.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS' } });
      const second = await overview(mia, org);
      expect(second).toEqual(first);

      // A comment changes no number, so it keeps the cache.
      await api.post(ada, path(org, `/tasks/${t.id}/comments`), { body: 'hi' }).expect(201);
      expect((await overview(mia, org)).totals.byStatus.TODO).toBe(1);

      // A task change through the API drops the organization's entries.
      await task(org, p);
      const third = await overview(mia, org);
      expect(third.totals.byStatus).toMatchObject({ TODO: 1, IN_PROGRESS: 1 });
    });

    it('is dropped by project and membership changes too', async () => {
      const org = await freshOrg();
      const p = await project(org, 'Before');
      expect((await overview(mia, org)).projects[0].name).toBe('Before');
      await api.patch(ada, path(org, `/projects/${p.id}`), { name: 'After' }).expect(200);
      expect((await overview(mia, org)).projects[0].name).toBe('After');

      expect((await team(ada, org)).members.map((m) => m.name)).toContain('max');
      await api.del(ada, path(org, `/members/${max.id}`)).expect(204);
      expect((await team(ada, org)).members.map((m) => m.name)).not.toContain('max');
    });

    it('keeps each organization and each query apart', async () => {
      const a = await freshOrg();
      const b = await freshOrg();
      const pa = await project(a, 'A');
      await task(a, pa);
      await overview(mia, a);
      expect((await overview(mia, b)).totals.byStatus.TODO).toBe(0);
      expect((await overview(mia, a, '?days=7')).range.days).toBe(7);
      expect((await overview(mia, a, `?projectId=${pa.id}`)).projects).toHaveLength(1);
    });
  });

  describe('indexes', () => {
    // On the small test tables Postgres would rather read everything, so the other ways are made
    // expensive and the cheapest left is an index-ONLY scan: answering from the index without
    // reading the table. That is possible only with an index whose condition the query's WHERE
    // implies and whose columns hold everything the query reads. (On the load data Postgres picks
    // these plans by itself: docs/PERFORMANCE.md.)
    const plan = (sql: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
        await tx.$executeRawUnsafe('SET LOCAL enable_bitmapscan = off');
        await tx.$executeRawUnsafe('SET LOCAL enable_indexscan = off');
        const rows = await tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(`EXPLAIN ${sql}`);
        return rows.map((row) => row['QUERY PLAN']).join('\n');
      });

    it('reads open work through tasks_open_work_idx', async () => {
      expect(
        await plan(`SELECT count(*), count(*) FILTER (WHERE "dueDate" < now()) FROM "tasks"
                    WHERE "organizationId" = 'x' AND "deletedAt" IS NULL AND "status" <> 'DONE'`),
      ).toMatch(/Index Only Scan using tasks_open_work_idx/);
    });

    it('reads finished work through tasks_completed_idx', async () => {
      expect(
        await plan(`SELECT count(*), max("createdAt") FROM "tasks"
                    WHERE "organizationId" = 'x' AND "deletedAt" IS NULL
                      AND "completedAt" IS NOT NULL AND "completedAt" >= now() - interval '30 days'`),
      ).toMatch(/Index Only Scan using tasks_completed_idx/);
    });
  });

  describe('metrics endpoint', () => {
    const scrape = (token?: string) => {
      const req = ctx.http().get('/api/metrics');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    it('needs the metrics token', async () => {
      await scrape().expect(401);
      await scrape('wrong-token-wrong-token').expect(401);
      // A user's access token is not the metrics token.
      await scrape(ada.token).expect(401);
    });

    it('reports request times by route template, cache results and queue sizes', async () => {
      const org = await freshOrg();
      await overview(mia, org);
      await overview(mia, org);
      await ctx.http().get('/api/v1/no-such-route').expect(404);

      const res = await scrape(METRICS_TOKEN).expect(200);
      expect(res.headers['content-type']).toContain('text/plain');
      const text = res.text;
      expect(text).toContain(
        'http_request_duration_seconds_count{method="GET",route="/api/v1/organizations/:orgId/analytics/overview",status="200"}',
      );
      // Ids and unknown URLs never become labels (each would be a new time series): an unknown
      // URL is counted under the catch-all route's template.
      expect(text).not.toContain(org.id);
      expect(text).not.toContain('no-such-route');
      expect(text).toMatch(/route="[^"]*",status="404"/);
      expect(text).toMatch(/cache_requests_total\{cache="analytics",result="hit"\} [1-9]/);
      expect(text).toMatch(/queue_jobs\{queue="dead-letter",state="waiting"\} \d+/);
      expect(text).toContain('process_cpu_seconds_total');
    });
  });
});
