import { PrismaService } from '../src/prisma/prisma.service';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

interface Result {
  tasks: { id: string; title: string; projectName: string; parentId: string | null }[];
  projects: { id: string; name: string }[];
}

describe('search (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let prisma: PrismaService;
  let ada: TestUser; // OWNER of Acme
  let mia: TestUser; // MEMBER of Acme
  let grace: TestUser; // OWNER of Globex
  let acme: TestOrg;
  let globex: TestOrg;

  const body = <T>(res: { body: unknown }) => res.body as T;
  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;

  // Every test uses its own made-up words, so tests cannot find each other's rows.
  let counter = 0;
  const word = (name: string) => `${name}${Date.now().toString(36)}${++counter}`;

  const search = async (user: TestUser, org: TestOrg, q: string, extra = '') =>
    body<Result>(
      await api.get(user, path(org, `/search?q=${encodeURIComponent(q)}${extra}`)).expect(200),
    );
  const titles = (result: Result) => result.tasks.map((t) => t.title);

  const project = async (name: string, extra: object = {}, org = acme, user = ada) =>
    body<{ id: string }>(
      await api.post(user, path(org, '/projects'), { name, ...extra }).expect(201),
    );
  const task = async (
    p: { id: string },
    title: string,
    extra: object = {},
    org = acme,
    user = ada,
  ) =>
    body<{ id: string }>(
      await api.post(user, path(org, `/projects/${p.id}/tasks`), { title, ...extra }).expect(201),
    );

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    prisma = ctx.app.get(PrismaService);
    [ada, mia, grace] = await Promise.all(['ada', 'mia', 'grace'].map((n) => ctx.signUp(n)));
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, mia, 'MEMBER');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('finding tasks', () => {
    it('matches whole words, prefixes and several words together, ignoring case', async () => {
      const w = word('quasar');
      const p = await project('Sky');
      await task(p, `Calibrate ${w} sensor`);
      await task(p, `Calibrate something else`);

      expect(titles(await search(mia, acme, w))).toEqual([`Calibrate ${w} sensor`]);
      expect(titles(await search(mia, acme, w.toUpperCase()))).toEqual([`Calibrate ${w} sensor`]);
      expect(titles(await search(mia, acme, w.slice(0, -2)))).toContain(`Calibrate ${w} sensor`); // prefix
      expect(titles(await search(mia, acme, `calib ${w}`))).toEqual([`Calibrate ${w} sensor`]); // both words
      expect(titles(await search(mia, acme, `${w} nonexistentword`))).toEqual([]); // every word must match
    });

    it('also searches descriptions, but ranks a title hit above a description hit', async () => {
      const w = word('nebula');
      const p = await project('Sky');
      await task(p, 'Only in the description', { description: `we study the ${w} closely` });
      await task(p, `The ${w} in the title`);

      expect(titles(await search(mia, acme, w))).toEqual([
        `The ${w} in the title`,
        'Only in the description',
      ]);
    });

    it('handles non-English letters', async () => {
      const w = word('çalışma');
      const p = await project('Sky');
      await task(p, `Haftalık ${w} toplantısı`);

      expect(titles(await search(mia, acme, w.toUpperCase().replace('I', 'ı')))).toEqual([
        `Haftalık ${w} toplantısı`,
      ]);
      expect(titles(await search(mia, acme, `haftalık ${w}`))).toHaveLength(1);
    });

    it('follows edits: the old words stop matching and the new ones start', async () => {
      const [before, after] = [word('olddraft'), word('newfinal')];
      const p = await project('Sky');
      const t = await task(p, `Report ${before}`);

      await api.patch(mia, path(acme, `/tasks/${t.id}`), { title: `Report ${after}` }).expect(200);

      expect(titles(await search(mia, acme, before))).toEqual([]);
      expect(titles(await search(mia, acme, after))).toEqual([`Report ${after}`]);
    });

    it('includes subtasks, says which project a task is in, and can be limited to one project', async () => {
      const w = word('orbit');
      const [one, two] = [await project('Mission One'), await project('Mission Two')];
      const parent = await task(one, `Plan ${w}`);
      await api
        .post(mia, path(acme, `/tasks/${parent.id}/subtasks`), { title: `Check ${w} math` })
        .expect(201);
      await task(two, `Fly ${w}`);

      const all = await search(mia, acme, w);
      expect(all.tasks).toHaveLength(3);
      expect(all.tasks.find((t) => t.title === `Fly ${w}`)?.projectName).toBe('Mission Two');
      expect(all.tasks.find((t) => t.title === `Check ${w} math`)?.parentId).toBe(parent.id);

      const onlyOne = await search(mia, acme, w, `&projectId=${one.id}`);
      expect(titles(onlyOne).sort()).toEqual([`Check ${w} math`, `Plan ${w}`]);
      expect(onlyOne.projects).toEqual([]);
    });

    it('respects the limit', async () => {
      const w = word('crowd');
      const p = await project('Sky');
      for (let i = 0; i < 5; i++) await task(p, `${w} item ${i}`);

      expect((await search(mia, acme, w, '&limit=2')).tasks).toHaveLength(2);
      expect((await search(mia, acme, w)).tasks).toHaveLength(5);
      await api.get(mia, path(acme, `/search?q=${w}&limit=51`)).expect(400);
      await api.get(mia, path(acme, `/search?q=${w}&limit=0`)).expect(400);
    });

    it('hides deleted tasks and the tasks of deleted projects', async () => {
      const w = word('ghost');
      const [live, doomed] = [await project('Live'), await project('Doomed')];
      const gone = await task(live, `Deleted ${w}`);
      await task(live, `Kept ${w}`);
      await task(doomed, `In deleted project ${w}`);
      await api.del(ada, path(acme, `/tasks/${gone.id}`)).expect(204);
      await api.del(ada, path(acme, `/projects/${doomed.id}`)).expect(204);

      expect(titles(await search(mia, acme, w))).toEqual([`Kept ${w}`]);
    });

    it('hides tasks whose project is deleted, even if the tasks themselves were not marked', async () => {
      const w = word('orphan');
      const p = await project('Half deleted');
      await task(p, `Orphan ${w}`);
      // Only the project row is marked: what a bug, a manual fix or a partial restore could leave.
      await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });

      expect(titles(await search(mia, acme, w))).toEqual([]);
    });
  });

  describe('finding projects', () => {
    it('matches name, department and description', async () => {
      const [a, b, c] = [word('alpha'), word('bravo'), word('charlie')];
      await project(`Project ${a}`);
      await project('Plain name', { department: `Dept ${b}` });
      await project('Another name', { description: `All about ${c}` });

      expect((await search(mia, acme, a)).projects.map((p) => p.name)).toEqual([`Project ${a}`]);
      expect((await search(mia, acme, b)).projects.map((p) => p.name)).toEqual(['Plain name']);
      expect((await search(mia, acme, c)).projects.map((p) => p.name)).toEqual(['Another name']);
    });

    it('hides deleted projects', async () => {
      const w = word('retired');
      const p = await project(`Old ${w}`);
      await api.del(ada, path(acme, `/projects/${p.id}`)).expect(204);

      expect((await search(mia, acme, w)).projects).toEqual([]);
    });
  });

  describe('tenant isolation', () => {
    it("never finds another company's rows, even with the same words", async () => {
      const w = word('secret');
      const [acmeProject, globexProject] = [
        await project(`Acme ${w}`),
        await project(`Globex ${w}`, {}, globex, grace),
      ];
      await task(acmeProject, `Acme task ${w}`);
      await task(globexProject, `Globex task ${w}`, {}, globex, grace);

      const mine = await search(mia, acme, w);
      expect(titles(mine)).toEqual([`Acme task ${w}`]);
      expect(mine.projects.map((p) => p.name)).toEqual([`Acme ${w}`]);
      const theirs = await search(grace, globex, w);
      expect(titles(theirs)).toEqual([`Globex task ${w}`]);
      expect(theirs.projects.map((p) => p.name)).toEqual([`Globex ${w}`]);
    });

    it("cannot be pointed at another company's project or organization", async () => {
      const w = word('private');
      const p = await project(`Hidden ${w}`);
      await task(p, `Hidden ${w}`);

      await api.get(grace, path(acme, `/search?q=${w}`)).expect(404); // not a member
      // A project id of another company, through her own organization, finds nothing.
      expect(titles(await search(grace, globex, w, `&projectId=${p.id}`))).toEqual([]);
    });
  });

  describe('what people type', () => {
    it('is never mistaken for query syntax or SQL', async () => {
      const w = word('safe');
      await task(await project('Sky'), `Handle ${w}`);

      for (const q of [
        "' OR 1=1 --",
        '& | ! ( ) :*',
        '"; DROP TABLE tasks; --',
        '\\',
        `${w} & | !`,
      ]) {
        await api.get(mia, path(acme, `/search?q=${encodeURIComponent(q)}`)).expect(200);
      }
      expect(titles(await search(mia, acme, `${w} & | !`))).toEqual([`Handle ${w}`]);
      expect(await prisma.task.count()).toBeGreaterThan(0); // the table is still there
    });

    it('returns nothing for nothing, and refuses missing or oversized input', async () => {
      expect(await search(mia, acme, '')).toEqual({ tasks: [], projects: [] });
      expect(await search(mia, acme, '   ')).toEqual({ tasks: [], projects: [] });
      expect(await search(mia, acme, '---')).toEqual({ tasks: [], projects: [] });
      await api.get(mia, path(acme, '/search')).expect(400);
      await api.get(mia, path(acme, `/search?q=${'x'.repeat(101)}`)).expect(400);
      await api.get(mia, path(acme, '/search?q=a&projectId=nope')).expect(400);
    });
  });

  describe('the index', () => {
    it('is what answers a search: the query plan reads the GIN index, not every row', async () => {
      const plan = await prisma.$transaction(async (tx) => {
        // On a small test table Postgres would rather scan everything; this switches that off
        // to show the query is shaped so that the index CAN serve it.
        await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
        return tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
          `EXPLAIN SELECT "id" FROM "tasks" WHERE "searchVector" @@ to_tsquery('simple', 'word:*')`,
        );
      });

      expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain('tasks_search_idx');
    });
  });
});
