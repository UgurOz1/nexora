import { PrismaService } from '../src/prisma/prisma.service';
import { isValidKey, keyBetween } from '../src/tasks/order-key';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
const STATUSES: Status[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

interface Project {
  id: string;
}
interface Task {
  id: string;
  title: string;
  status: Status;
  position: string;
}
interface Board {
  columns: { status: Status; tasks: Task[]; hasMore: boolean }[];
}
interface HistoryPage {
  items: { type: string; changes: Record<string, { from: unknown; to: unknown }> }[];
}

// Small deterministic random generator, so a failing run can be reproduced.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('kanban board (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let prisma: PrismaService;
  let ada: TestUser; // OWNER of Acme
  let max: TestUser; // MANAGER
  let mia: TestUser; // MEMBER
  let grace: TestUser; // OWNER of Globex
  let acme: TestOrg;
  let globex: TestOrg;

  const body = <T>(res: { body: unknown }) => res.body as T;
  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;

  let counter = 0;
  const newProject = async () =>
    body<Project>(
      await api.post(max, path(acme, '/projects'), { name: `Board ${++counter}` }).expect(201),
    );
  const newTask = async (project: Project, title: string, extra: object = {}) =>
    body<Task>(
      await api
        .post(mia, path(acme, `/projects/${project.id}/tasks`), { title, ...extra })
        .expect(201),
    );
  const getBoard = async (project: Project, user = mia) =>
    body<Board>(await api.get(user, path(acme, `/projects/${project.id}/board`)).expect(200));
  const column = (board: Board, status: Status) =>
    board.columns.find((c) => c.status === status)!.tasks.map((t) => t.title);
  const move = (
    task: { id: string },
    status: Status,
    afterId: string | null | undefined,
    user = mia,
  ) =>
    api.post(
      user,
      path(acme, `/tasks/${task.id}/move`),
      afterId === undefined ? { status } : { status, afterId },
    );

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    prisma = ctx.app.get(PrismaService);
    [ada, max, mia, grace] = await Promise.all(
      ['ada', 'max', 'mia', 'grace'].map((name) => ctx.signUp(name)),
    );
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, max, 'MANAGER');
    await api.join(ada, acme, mia, 'MEMBER');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('reading the board', () => {
    it('has one column per status, in workflow order, with new tasks at the bottom', async () => {
      const project = await newProject();
      const a = await newTask(project, 'A');
      await newTask(project, 'B');
      await newTask(project, 'C');
      await newTask(project, 'D', { status: 'IN_PROGRESS' });
      await newTask(project, 'E', { status: 'DONE' });
      await api
        .post(mia, path(acme, `/tasks/${a.id}/subtasks`), { title: 'Subtask of A' })
        .expect(201);

      const board = await getBoard(project);

      expect(board.columns.map((c) => c.status)).toEqual(STATUSES);
      expect(column(board, 'TODO')).toEqual(['A', 'B', 'C']); // subtasks are not on the board
      expect(column(board, 'IN_PROGRESS')).toEqual(['D']);
      expect(column(board, 'IN_REVIEW')).toEqual([]);
      expect(column(board, 'DONE')).toEqual(['E']);
      expect(board.columns.every((c) => !c.hasMore)).toBe(true);
    });

    it('leaves out deleted tasks', async () => {
      const project = await newProject();
      await newTask(project, 'Keep');
      const gone = await newTask(project, 'Gone');
      await api.del(mia, path(acme, `/tasks/${gone.id}`)).expect(204);

      expect(column(await getBoard(project), 'TODO')).toEqual(['Keep']);
    });

    it('moves a task to the bottom of the new column when its status is edited in the form', async () => {
      const project = await newProject();
      const a = await newTask(project, 'A');
      await newTask(project, 'Waiting', { status: 'DONE' });

      await api.patch(mia, path(acme, `/tasks/${a.id}`), { status: 'DONE' }).expect(200);

      expect(column(await getBoard(project), 'DONE')).toEqual(['Waiting', 'A']);
    });
  });

  describe('moving cards', () => {
    it('reorders inside a column and the order survives a reload', async () => {
      const project = await newProject();
      const [x, y, z] = [
        await newTask(project, 'X'),
        await newTask(project, 'Y'),
        await newTask(project, 'Z'),
      ];

      await move(z, 'TODO', x.id).expect(200); // Z right after X
      expect(column(await getBoard(project), 'TODO')).toEqual(['X', 'Z', 'Y']);

      await move(y, 'TODO', null).expect(200); // Y to the top
      expect(column(await getBoard(project), 'TODO')).toEqual(['Y', 'X', 'Z']);

      await move(y, 'TODO', z.id).expect(200); // Y to the bottom, after the last card
      expect(column(await getBoard(project, ada), 'TODO')).toEqual(['X', 'Z', 'Y']);
    });

    it('moves between columns, changing the status, and records it in the history', async () => {
      const project = await newProject();
      const [x, y] = [await newTask(project, 'X'), await newTask(project, 'Y')];

      const moved = body<Task>(await move(y, 'IN_PROGRESS', null).expect(200));
      expect(moved.status).toBe('IN_PROGRESS');
      await move(x, 'IN_PROGRESS', y.id).expect(200);

      const board = await getBoard(project);
      expect(column(board, 'TODO')).toEqual([]);
      expect(column(board, 'IN_PROGRESS')).toEqual(['Y', 'X']);

      const history = body<HistoryPage>(
        await api.get(mia, path(acme, `/tasks/${y.id}/history`)).expect(200),
      );
      expect(history.items[0].changes.status).toEqual({ from: 'TODO', to: 'IN_PROGRESS' });
    });

    it('does not add history entries for plain reordering', async () => {
      const project = await newProject();
      const [x, y] = [await newTask(project, 'X'), await newTask(project, 'Y')];

      await move(y, 'TODO', null).expect(200);
      await move(x, 'TODO', y.id).expect(200);

      const history = body<HistoryPage>(
        await api.get(mia, path(acme, `/tasks/${y.id}/history`)).expect(200),
      );
      expect(history.items.map((e) => e.type)).toEqual(['CREATED']);
    });

    it('is allowed for every member, including plain members', async () => {
      const project = await newProject();
      const task = await newTask(project, 'T');

      await move(task, 'IN_REVIEW', null, mia).expect(200);
      await move(task, 'DONE', null, max).expect(200);
    });

    it('rejects impossible placements', async () => {
      const project = await newProject();
      const other = await newProject();
      const [a, b] = [await newTask(project, 'A'), await newTask(project, 'B', { status: 'DONE' })];
      const elsewhere = await newTask(other, 'Elsewhere');

      await move(a, 'TODO', a.id).expect(400); // after itself
      await move(a, 'TODO', b.id).expect(400); // after a card of another column
      await move(a, 'TODO', elsewhere.id).expect(400); // after a card of another project
      await move(a, 'TODO', '00000000-0000-4000-8000-000000000000').expect(400); // unknown card
      await move(a, 'TODO', 'not-a-uuid').expect(400);
      await api.post(mia, path(acme, `/tasks/${a.id}/move`), { status: 'NOPE' }).expect(400);
      await api
        .post(mia, path(acme, `/tasks/${a.id}/move`), { status: 'TODO', position: 'a1' })
        .expect(400);

      expect(column(await getBoard(project), 'TODO')).toEqual(['A']); // nothing moved
    });
  });

  describe('dependencies on the board', () => {
    it('keep a blocked task in TODO, but it can still be reordered there', async () => {
      const project = await newProject();
      const [first, blocked, last] = [
        await newTask(project, 'First'),
        await newTask(project, 'Blocked'),
        await newTask(project, 'Last'),
      ];
      await api
        .post(mia, path(acme, `/tasks/${blocked.id}/dependencies`), { dependsOnId: first.id })
        .expect(201);

      const refused = await move(blocked, 'IN_PROGRESS', null).expect(409);
      expect((refused.body as { message: string }).message).toContain('First');
      await move(blocked, 'TODO', last.id).expect(200);
      expect(column(await getBoard(project), 'TODO')).toEqual(['First', 'Last', 'Blocked']);

      await move(first, 'DONE', null).expect(200); // the blocker is finished
      await move(blocked, 'IN_PROGRESS', null).expect(200);
    });
  });

  describe('ordering holds up', () => {
    it('stays correct through many random moves between columns', async () => {
      const project = await newProject();
      const next = random(7);
      const model: Record<Status, Task[]> = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
      for (let i = 0; i < 8; i++) {
        model.TODO.push(await newTask(project, `T${i}`));
      }

      for (let step = 0; step < 40; step++) {
        const all = STATUSES.flatMap((s) => model[s]);
        const task = all[Math.floor(next() * all.length)];
        const target = STATUSES[Math.floor(next() * STATUSES.length)];

        // Where to drop: after a random card of the target column (not the card itself), or the top.
        const others = model[target].filter((t) => t.id !== task.id);
        const afterIndex = Math.floor(next() * (others.length + 1)) - 1; // -1 = top
        const after = others[afterIndex] ?? null;

        await move(task, target, after?.id ?? null).expect(200);

        for (const s of STATUSES) {
          model[s] = model[s].filter((t) => t.id !== task.id);
        }
        const insertAt = after ? model[target].findIndex((t) => t.id === after.id) + 1 : 0;
        model[target].splice(insertAt, 0, task);
      }

      const board = await getBoard(project);
      for (const status of STATUSES) {
        expect(column(board, status)).toEqual(model[status].map((t) => t.title));
      }
    });

    it('sorts keys in the database exactly like plain string comparison', async () => {
      // The keys are sorted by Postgres (ORDER BY), whose collation rules could differ from a
      // character-by-character comparison. 300 keys built by random insertions prove they agree.
      const project = await newProject();
      const next = random(99);
      const keys: string[] = [];
      for (let i = 0; i < 300; i++) {
        const index = Math.floor(next() * (keys.length + 1));
        keys.splice(index, 0, keyBetween(keys[index - 1] ?? null, keys[index] ?? null));
      }
      const creator = await prisma.user.findUniqueOrThrow({ where: { id: mia.id } });
      await prisma.task.createMany({
        data: keys.map((position, i) => ({
          organizationId: acme.id,
          projectId: project.id,
          createdById: creator.id,
          title: `K${i}`,
          position,
        })),
      });

      const stored = await prisma.task.findMany({
        where: { projectId: project.id },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { position: true },
      });

      expect(stored.map((t) => t.position)).toEqual(keys);
    });

    it('survives two cards dropped into the same slot at the same moment', async () => {
      const project = await newProject();
      const [p, q, r, s] = [
        await newTask(project, 'P'),
        await newTask(project, 'Q'),
        await newTask(project, 'R'),
        await newTask(project, 'S'),
      ];

      // Both compute a key between P and S. Without care they would get the same key.
      const results = await Promise.all([move(q, 'TODO', p.id), move(r, 'TODO', p.id)]);
      expect(results.map((res) => res.status)).toEqual([200, 200]);

      const first = column(await getBoard(project), 'TODO');
      const second = column(await getBoard(project), 'TODO');
      expect(first).toEqual(second); // a stable order, not a coin flip per request
      expect(first[0]).toBe('P');
      expect(first[3]).toBe('S');
      expect([...first].sort()).toEqual(['P', 'Q', 'R', 'S']);

      // And the board keeps working: further drops are accepted.
      await move(s, 'TODO', q.id).expect(200);
      await move(p, 'TODO', s.id).expect(200);
      expect(new Set(column(await getBoard(project), 'TODO')).size).toBe(4);
    });

    it('renumbers a column whose keys are unusable instead of failing', async () => {
      const project = await newProject();
      const [a, b, c] = [
        await newTask(project, 'A'),
        await newTask(project, 'B'),
        await newTask(project, 'C'),
      ];
      // Keys from an older format (a trailing zero is not a valid key) and a duplicate.
      await prisma.task.update({ where: { id: a.id }, data: { position: 'a0' } });
      await prisma.task.update({ where: { id: b.id }, data: { position: 'a0' } });

      await move(c, 'TODO', a.id).expect(200);

      const stored = await prisma.task.findMany({
        where: { projectId: project.id },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { title: true, position: true },
      });
      expect(stored.every((t) => isValidKey(t.position))).toBe(true);
      expect(new Set(stored.map((t) => t.position)).size).toBe(3); // distinct again
      expect(stored.map((t) => t.title).indexOf('C')).toBe(
        stored.map((t) => t.title).indexOf('A') + 1,
      );
    });
  });

  describe('tenant isolation', () => {
    it("never shows or moves another company's cards", async () => {
      const project = await newProject();
      const task = await newTask(project, 'Secret');
      const globexProject = body<Project>(
        await api.post(grace, path(globex, '/projects'), { name: 'G' }).expect(201),
      );
      const globexTask = body<Task>(
        await api
          .post(grace, path(globex, `/projects/${globexProject.id}/tasks`), { title: 'G task' })
          .expect(201),
      );

      await api.get(grace, path(acme, `/projects/${project.id}/board`)).expect(404);
      await api.get(grace, path(globex, `/projects/${project.id}/board`)).expect(404); // Acme's id, her route
      await api.post(grace, path(acme, `/tasks/${task.id}/move`), { status: 'DONE' }).expect(404);
      await api.post(grace, path(globex, `/tasks/${task.id}/move`), { status: 'DONE' }).expect(404);
      await move(task, 'TODO', globexTask.id).expect(400); // a card of another company is not a neighbour

      expect(column(await getBoard(project), 'TODO')).toEqual(['Secret']);
      expect(
        body<Board>(
          await api.get(grace, path(globex, `/projects/${globexProject.id}/board`)).expect(200),
        ).columns.flatMap((c) => c.tasks.map((t) => t.title)),
      ).toEqual(['G task']);
    });
  });
});
