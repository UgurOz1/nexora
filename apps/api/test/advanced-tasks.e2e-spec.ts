import { PrismaService } from '../src/prisma/prisma.service';
import { RecurringTasksService } from '../src/recurring-tasks/recurring-tasks.service';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

interface Project {
  id: string;
}
interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  isBlocked: boolean;
  blockedBy?: { id: string; title: string; status: string }[];
  blocks?: { id: string; title: string }[];
  dueDate: string | null;
  recurringTaskId: string | null;
}
interface HistoryEvent {
  id: string;
  type: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  actor: { id: string; name: string } | null;
}
interface HistoryPage {
  items: HistoryEvent[];
  nextCursor: string | null;
}
interface Template {
  id: string;
  active: boolean;
  nextRunAt: string | null;
  upcoming: string[];
}

const DAY = 24 * 60 * 60 * 1000;

describe('dependencies, history and recurring tasks (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let prisma: PrismaService;
  let recurring: RecurringTasksService;
  let ada: TestUser; // OWNER of Acme
  let max: TestUser; // MANAGER
  let mia: TestUser; // MEMBER
  let grace: TestUser; // OWNER of Globex
  let acme: TestOrg;
  let globex: TestOrg;
  let release: Project;

  const body = <T>(res: { body: unknown }) => res.body as T;
  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;

  let counter = 0;
  const newTask = async (user: TestUser, title: string, extra: object = {}, project = release) =>
    body<Task>(
      await api
        .post(user, path(acme, `/projects/${project.id}/tasks`), {
          title: `${title} ${++counter}`,
          ...extra,
        })
        .expect(201),
    );
  const getTask = async (user: TestUser, task: { id: string }) =>
    body<Task>(await api.get(user, path(acme, `/tasks/${task.id}`)).expect(200));
  const depend = (user: TestUser, task: { id: string }, on: { id: string }, org = acme) =>
    api.post(user, path(org, `/tasks/${task.id}/dependencies`), { dependsOnId: on.id });
  const setStatus = (user: TestUser, task: { id: string }, status: string) =>
    api.patch(user, path(acme, `/tasks/${task.id}`), { status });
  const history = async (task: { id: string }, query = 'limit=100') =>
    body<HistoryPage>(
      await api.get(ada, path(acme, `/tasks/${task.id}/history?${query}`)).expect(200),
    );

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    prisma = ctx.app.get(PrismaService);
    recurring = ctx.app.get(RecurringTasksService);
    [ada, max, mia, grace] = await Promise.all(
      ['ada', 'max', 'mia', 'grace'].map((name) => ctx.signUp(name)),
    );
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, max, 'MANAGER');
    await api.join(ada, acme, mia, 'MEMBER');
    release = body<Project>(
      await api.post(max, path(acme, '/projects'), { name: 'Release' }).expect(201),
    );
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('dependencies', () => {
    it('make a task wait for another, and both sides show it', async () => {
      const build = await newTask(mia, 'Build');
      const deploy = await newTask(mia, 'Deploy');

      const res = await depend(mia, deploy, build).expect(201);
      expect(res.body).toMatchObject({ taskId: deploy.id, dependsOn: { id: build.id } });

      const waiting = await getTask(mia, deploy);
      expect(waiting.isBlocked).toBe(true);
      expect(waiting.blockedBy?.map((t) => t.id)).toEqual([build.id]);
      expect((await getTask(mia, build)).blocks?.map((t) => t.id)).toEqual([deploy.id]);
      expect((await getTask(mia, build)).isBlocked).toBe(false);
    });

    it('stop a task from moving forward until what it waits for is DONE', async () => {
      const build = await newTask(mia, 'Build');
      const deploy = await newTask(mia, 'Deploy');
      await depend(mia, deploy, build).expect(201);

      const refused = await setStatus(mia, deploy, 'IN_PROGRESS').expect(409);
      expect((refused.body as { message: string }).message).toContain(build.title);
      await setStatus(mia, deploy, 'DONE').expect(409);
      await setStatus(mia, deploy, 'TODO').expect(200); // staying or going back is always fine
      expect((await getTask(mia, deploy)).status).toBe('TODO');

      await setStatus(mia, build, 'DONE').expect(200);
      expect((await getTask(mia, deploy)).isBlocked).toBe(false);
      await setStatus(mia, deploy, 'IN_PROGRESS').expect(200);
    });

    it('stop waiting once the task they waited for is deleted', async () => {
      const build = await newTask(mia, 'Build');
      const deploy = await newTask(mia, 'Deploy');
      await depend(mia, deploy, build).expect(201);
      await setStatus(mia, deploy, 'IN_PROGRESS').expect(409);

      await api.del(mia, path(acme, `/tasks/${build.id}`)).expect(204);

      await setStatus(mia, deploy, 'IN_PROGRESS').expect(200);
      expect((await getTask(mia, deploy)).blockedBy).toEqual([]);
    });

    it('cannot form a cycle: not with itself, not directly, not through other tasks', async () => {
      const [a, b, c, d] = [
        await newTask(mia, 'A'),
        await newTask(mia, 'B'),
        await newTask(mia, 'C'),
        await newTask(mia, 'D'),
      ];

      await depend(mia, a, a).expect(400);

      await depend(mia, a, b).expect(201);
      const direct = await depend(mia, b, a).expect(400);
      expect((direct.body as { message: string }).message).toContain('cycle');

      await depend(mia, b, c).expect(201);
      await depend(mia, c, d).expect(201);
      const loop = await depend(mia, d, a).expect(400);
      // The message names the whole loop: D -> A -> B -> C -> D.
      const message = (loop.body as { message: string }).message;
      for (const task of [a, b, c, d]) {
        expect(message).toContain(task.title);
      }

      // None of the refused edges were saved.
      expect((await getTask(mia, d)).blockedBy).toEqual([]);
    });

    it('allow a diamond shape and shortcuts, which are not cycles', async () => {
      const [top, left, right, bottom] = [
        await newTask(mia, 'Top'),
        await newTask(mia, 'Left'),
        await newTask(mia, 'Right'),
        await newTask(mia, 'Bottom'),
      ];

      await depend(mia, top, left).expect(201);
      await depend(mia, top, right).expect(201);
      await depend(mia, left, bottom).expect(201);
      await depend(mia, right, bottom).expect(201);
      await depend(mia, top, bottom).expect(201);
    });

    it('reject duplicates and tasks that do not exist', async () => {
      const a = await newTask(mia, 'A');
      const b = await newTask(mia, 'B');
      await depend(mia, a, b).expect(201);

      await depend(mia, a, b).expect(409);
      await depend(mia, a, { id: '00000000-0000-4000-8000-000000000000' }).expect(404);
      await api
        .post(mia, path(acme, `/tasks/${a.id}/dependencies`), { dependsOnId: 'nope' })
        .expect(400);
    });

    it('can be removed, after which the task is free again', async () => {
      const a = await newTask(mia, 'A');
      const b = await newTask(mia, 'B');
      await depend(mia, a, b).expect(201);

      await api.del(mia, path(acme, `/tasks/${a.id}/dependencies/${b.id}`)).expect(204);

      expect((await getTask(mia, a)).isBlocked).toBe(false);
      await api.del(mia, path(acme, `/tasks/${a.id}/dependencies/${b.id}`)).expect(404);
      await depend(mia, b, a).expect(201); // the reverse is allowed now
    });

    it('never cross company borders', async () => {
      const acmeTask = await newTask(mia, 'Acme task');
      const other = await newTask(mia, 'Other acme task');
      const globexProject = body<Project>(
        await api.post(grace, path(globex, '/projects'), { name: 'G' }).expect(201),
      );
      const globexTask = body<Task>(
        await api
          .post(grace, path(globex, `/projects/${globexProject.id}/tasks`), { title: 'G task' })
          .expect(201),
      );

      await depend(grace, acmeTask, other, acme).expect(404); // not her company
      await depend(grace, acmeTask, other, globex).expect(404); // Acme ids on her own routes
      await depend(grace, globexTask, acmeTask, globex).expect(404); // her task, Acme's blocker
      await depend(mia, acmeTask, globexTask).expect(404); // Acme's task, Globex's blocker
      await api.get(grace, path(globex, `/tasks/${acmeTask.id}/history`)).expect(404);

      expect((await getTask(mia, acmeTask)).blockedBy).toEqual([]);
    });

    it('stay acyclic when requests arrive at the same moment', async () => {
      // 8 pairs; for each, "x waits for y" and "y waits for x" are sent together. Whatever the
      // timing, exactly one of the two may win.
      const pairs = await Promise.all(
        Array.from(
          { length: 8 },
          async () => [await newTask(mia, 'X'), await newTask(mia, 'Y')] as const,
        ),
      );

      const outcomes = await Promise.all(
        pairs.map(async ([x, y]) => {
          const [first, second] = await Promise.all([depend(mia, x, y), depend(mia, y, x)]);
          return [first.status, second.status].sort();
        }),
      );

      expect(outcomes).toEqual(Array(8).fill([201, 400]));
    });
  });

  describe('history', () => {
    it('records who created a task and what every edit changed', async () => {
      const task = await newTask(mia, 'Tracked', { labels: ['a', 'b'] });

      await api
        .patch(max, path(acme, `/tasks/${task.id}`), {
          title: 'Tracked and renamed',
          status: 'IN_PROGRESS',
          assigneeId: max.id,
        })
        .expect(200);

      const events = (await history(task)).items;
      expect(events.map((e) => e.type)).toEqual(['UPDATED', 'CREATED']);
      expect(events[1].actor).toMatchObject({ id: mia.id });
      expect(events[0].actor).toMatchObject({ id: max.id });
      expect(events[0].changes).toEqual({
        title: { from: task.title, to: 'Tracked and renamed' },
        status: { from: 'TODO', to: 'IN_PROGRESS' },
        assigneeId: { from: null, to: max.id },
      });
    });

    it('records nothing when an edit changes nothing', async () => {
      const task = await newTask(mia, 'Quiet', { labels: ['a', 'b'] });

      await api
        .patch(mia, path(acme, `/tasks/${task.id}`), { title: task.title, labels: ['b', 'a'] })
        .expect(200);

      expect((await history(task)).items.map((e) => e.type)).toEqual(['CREATED']);
    });

    it('is paged newest first, without gaps or repeats', async () => {
      const task = await newTask(mia, 'Busy');
      for (const priority of ['LOW', 'HIGH', 'URGENT', 'LOW']) {
        await api.patch(mia, path(acme, `/tasks/${task.id}`), { priority }).expect(200);
      }

      const all = (await history(task)).items;
      expect(all).toHaveLength(5);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page: HistoryPage = await history(
          task,
          `limit=2${cursor ? `&cursor=${cursor}` : ''}`,
        );
        seen.push(...page.items.map((e) => e.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toEqual(all.map((e) => e.id));
    });

    it('compares any two versions', async () => {
      const task = await newTask(mia, 'Versioned', { priority: 'LOW' });
      const url = path(acme, `/tasks/${task.id}`);
      await api.patch(mia, url, { priority: 'HIGH', title: 'Versioned v2' }).expect(200);
      await api.patch(mia, url, { priority: 'URGENT' }).expect(200);
      await api.patch(mia, url, { description: 'Final text' }).expect(200);

      const [v4, v3, v2, v1] = (await history(task)).items;
      const compare = async (from: HistoryEvent, to: HistoryEvent) =>
        body<{ changes: object }>(
          await api.get(mia, `${url}/history/compare?from=${from.id}&to=${to.id}`).expect(200),
        ).changes;

      expect(await compare(v1, v4)).toEqual({
        title: { from: task.title, to: 'Versioned v2' },
        priority: { from: 'LOW', to: 'URGENT' },
        description: { from: null, to: 'Final text' },
      });
      expect(await compare(v2, v3)).toEqual({ priority: { from: 'HIGH', to: 'URGENT' } });
      expect(await compare(v3, v3)).toEqual({});
      expect(await compare(v4, v1)).toMatchObject({ priority: { from: 'URGENT', to: 'LOW' } }); // backwards works too
    });

    it('rejects comparisons with entries of another task or that do not exist', async () => {
      const one = await newTask(mia, 'One');
      const two = await newTask(mia, 'Two');
      const [entryOne] = (await history(one)).items;
      const [entryTwo] = (await history(two)).items;

      const url = path(acme, `/tasks/${one.id}/history/compare`);
      await api.get(mia, `${url}?from=${entryOne.id}&to=${entryTwo.id}`).expect(404);
      await api
        .get(mia, `${url}?from=${entryOne.id}&to=00000000-0000-4000-8000-000000000000`)
        .expect(404);
      await api.get(mia, `${url}?from=nope&to=${entryOne.id}`).expect(400);
    });

    it('lists dependency changes too, and keeps the entries of deleted tasks in the database', async () => {
      const a = await newTask(mia, 'A');
      const b = await newTask(mia, 'B');
      await depend(mia, a, b).expect(201);
      await api.del(mia, path(acme, `/tasks/${a.id}/dependencies/${b.id}`)).expect(204);

      expect((await history(a)).items.map((e) => e.type)).toEqual([
        'DEPENDENCY_REMOVED',
        'DEPENDENCY_ADDED',
        'CREATED',
      ]);

      await api.del(mia, path(acme, `/tasks/${a.id}`)).expect(204);
      await api.get(mia, path(acme, `/tasks/${a.id}/history`)).expect(404); // gone from the API
      const stored = await prisma.taskEvent.findMany({
        where: { taskId: a.id },
        select: { type: true },
      });
      expect(stored.map((e) => e.type)).toContain('DELETED'); // but the audit trail is kept
    });

    it('stays correct when two people edit the same task at the same moment', async () => {
      // 10 tasks, each edited twice at once. Because edits queue up on the row, the second one
      // starts from the result of the first, so the two entries chain: A -> X, then X -> Y.
      const tasks = await Promise.all(Array.from({ length: 10 }, () => newTask(mia, 'Contended')));

      await Promise.all(
        tasks.map((task) =>
          Promise.all([
            api.patch(mia, path(acme, `/tasks/${task.id}`), { title: `${task.title} by mia` }),
            api.patch(max, path(acme, `/tasks/${task.id}`), { title: `${task.title} by max` }),
          ]),
        ),
      );

      for (const task of tasks) {
        const [second, first] = (await history(task)).items.filter((e) => e.type === 'UPDATED');
        expect(first.changes.title.from).toBe(task.title);
        expect(second.changes.title.from).toBe(first.changes.title.to);
        expect((await getTask(ada, task)).title).toBe(second.changes.title.to);
      }
    });
  });

  describe('recurring tasks', () => {
    const create = (user: TestUser, data: object) =>
      api.post(user, path(acme, '/recurring-tasks'), { projectId: release.id, ...data });
    const newTemplate = async (data: object = {}) =>
      body<Template>(
        await create(max, { title: 'Weekly report', rrule: 'FREQ=DAILY', ...data }).expect(201),
      );
    const generated = (template: { id: string }) =>
      prisma.task.findMany({
        where: { recurringTaskId: template.id },
        orderBy: { occurrenceAt: 'asc' },
      });
    const after = (template: Template, ms = 1000) => new Date(Date.parse(template.nextRunAt!) + ms);

    it('are created by managers, and show when they will fire next', async () => {
      await create(mia, { title: 'No', rrule: 'FREQ=DAILY' }).expect(403);

      const template = body<Template>(
        await create(max, { title: 'Monday report', rrule: 'FREQ=WEEKLY;BYDAY=MO' }).expect(201),
      );

      expect(template.active).toBe(true);
      expect(Date.parse(template.nextRunAt!)).toBeGreaterThan(Date.now());
      expect(template.upcoming).toHaveLength(5);
      for (const when of template.upcoming) {
        expect(new Date(when).getUTCDay()).toBe(1); // always a Monday
      }
    });

    it('validate the rule, the project and the assignee', async () => {
      await create(max, { title: 'x', rrule: 'FREQ=HOURLY' }).expect(400);
      await create(max, { title: 'x', rrule: 'every tuesday please' }).expect(400);
      await create(max, { title: 'x', rrule: 'FREQ=DAILY;DTSTART=20260101T000000Z' }).expect(400);
      await create(max, { title: 'x', rrule: 'FREQ=DAILY', dueInDays: 400 }).expect(400);
      await create(max, { title: 'x', rrule: 'FREQ=DAILY', assigneeId: grace.id }).expect(400);
      await api
        .post(max, path(acme, '/recurring-tasks'), {
          projectId: '00000000-0000-4000-8000-000000000000',
          title: 'x',
          rrule: 'FREQ=DAILY',
        })
        .expect(404);
    });

    it('create a task when due, with the template data, a due date and a system author', async () => {
      const template = await newTemplate({
        title: 'Daily standup notes',
        description: 'Write them down',
        priority: 'HIGH',
        labels: ['Ritual'],
        assigneeId: mia.id,
        dueInDays: 2,
      });

      expect(await recurring.generateDue(new Date(Date.parse(template.nextRunAt!) - 1000))).toBe(0); // not yet

      const created = await recurring.generateDue(after(template));
      expect(created).toBeGreaterThanOrEqual(1);

      const [task] = await generated(template);
      expect(task).toMatchObject({
        title: 'Daily standup notes',
        description: 'Write them down',
        priority: 'HIGH',
        labels: ['ritual'],
        assigneeId: mia.id,
        status: 'TODO',
        projectId: release.id,
      });
      expect(task.dueDate!.getTime()).toBe(Date.parse(template.nextRunAt!) + 2 * DAY);

      const entries = (await history(task)).items;
      expect(entries.map((e) => e.type)).toEqual(['CREATED']);
      expect(entries[0].actor).toBeNull(); // created by the system, not by a person

      const refreshed = body<Template>(
        await api.get(ada, path(acme, `/recurring-tasks/${template.id}`)).expect(200),
      );
      expect(Date.parse(refreshed.nextRunAt!)).toBeGreaterThan(after(template).getTime());
    });

    it('never create the same occurrence twice, even when two jobs run at once', async () => {
      const template = await newTemplate();
      const now = after(template);

      await Promise.all([
        recurring.generateDue(now),
        recurring.generateDue(now),
        recurring.generateDue(now),
      ]);
      await recurring.generateDue(now);

      expect(await generated(template)).toHaveLength(1);
    });

    it('skip missed occurrences instead of flooding people after downtime', async () => {
      const template = await newTemplate({ rrule: 'FREQ=DAILY' });
      const monthLater = after(template, 30 * DAY);

      await recurring.generateDue(monthLater);

      expect(await generated(template)).toHaveLength(1); // one task, not thirty
      const refreshed = body<Template>(
        await api.get(ada, path(acme, `/recurring-tasks/${template.id}`)).expect(200),
      );
      expect(Date.parse(refreshed.nextRunAt!)).toBeGreaterThan(monthLater.getTime());
    });

    it('can be paused and resumed, and a resumed schedule skips what it missed', async () => {
      const template = await newTemplate();
      await api
        .patch(max, path(acme, `/recurring-tasks/${template.id}`), { active: false })
        .expect(200);

      await recurring.generateDue(after(template, 10 * DAY));
      expect(await generated(template)).toHaveLength(0);

      const resumed = body<Template>(
        await api
          .patch(max, path(acme, `/recurring-tasks/${template.id}`), { active: true })
          .expect(200),
      );
      expect(Date.parse(resumed.nextRunAt!)).toBeGreaterThan(Date.now());
    });

    it('stop when the rule runs out', async () => {
      const template = await newTemplate({
        rrule: 'FREQ=DAILY;COUNT=1',
        startsAt: new Date(Date.now() + 1000).toISOString(),
      });
      const now = after(template);

      await recurring.generateDue(now);
      await recurring.generateDue(new Date(now.getTime() + 5 * DAY));

      expect(await generated(template)).toHaveLength(1);
      const stored = await prisma.recurringTask.findUniqueOrThrow({ where: { id: template.id } });
      expect(stored.nextRunAt).toBeNull();
    });

    it('skip projects that were deleted, and drop assignees who left the company', async () => {
      const doomed = body<Project>(
        await api.post(max, path(acme, '/projects'), { name: 'Doomed' }).expect(201),
      );
      const inDoomed = await newTemplate({ projectId: doomed.id });
      await api.del(ada, path(acme, `/projects/${doomed.id}`)).expect(204);

      const leaver = await ctx.signUp('leaver');
      await api.join(ada, acme, leaver, 'MEMBER');
      const assigned = await newTemplate({ assigneeId: leaver.id });
      await api.del(leaver, path(acme, `/members/${leaver.id}`)).expect(204);

      const now = new Date(Math.max(after(inDoomed).getTime(), after(assigned).getTime()));
      await recurring.generateDue(now);

      expect(await generated(inDoomed)).toHaveLength(0);
      const [task] = await generated(assigned);
      expect(task.assigneeId).toBeNull();
    });

    it('can be edited and deleted; tasks that were generated stay', async () => {
      const template = await newTemplate({ title: 'Original' });
      await recurring.generateDue(after(template));
      const [kept] = await generated(template);

      const edited = await api
        .patch(max, path(acme, `/recurring-tasks/${template.id}`), {
          title: 'Renamed',
          rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
        })
        .expect(200);
      expect(edited.body).toMatchObject({ title: 'Renamed' });
      await api
        .patch(max, path(acme, `/recurring-tasks/${template.id}`), { rrule: 'FREQ=HOURLY' })
        .expect(400);
      await api
        .patch(mia, path(acme, `/recurring-tasks/${template.id}`), { title: 'No' })
        .expect(403);
      await api.del(mia, path(acme, `/recurring-tasks/${template.id}`)).expect(403);

      await api.del(max, path(acme, `/recurring-tasks/${template.id}`)).expect(204);
      await api.get(max, path(acme, `/recurring-tasks/${template.id}`)).expect(404);
      // The task is still there; it just no longer points at the deleted template.
      const stillThere = await prisma.task.findUniqueOrThrow({ where: { id: kept.id } });
      expect(stillThere).toMatchObject({
        title: 'Original',
        deletedAt: null,
        recurringTaskId: null,
      });
    });

    it('are invisible and untouchable for other companies', async () => {
      const template = await newTemplate();
      const url = (org: TestOrg) => path(org, `/recurring-tasks/${template.id}`);

      await api.get(grace, url(acme)).expect(404);
      await api.get(grace, url(globex)).expect(404);
      await api.patch(grace, url(globex), { title: 'Hacked' }).expect(404);
      await api.del(grace, url(globex)).expect(404);
      expect(
        body<Template[]>(await api.get(grace, path(globex, '/recurring-tasks')).expect(200)),
      ).toEqual([]);
      await api
        .post(grace, path(globex, '/recurring-tasks'), {
          projectId: release.id,
          title: 'x',
          rrule: 'FREQ=DAILY',
        })
        .expect(404);
    });
  });
});
