import { PrismaService } from '../src/prisma/prisma.service';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

interface Project {
  id: string;
  name: string;
  department: string | null;
  description: string | null;
  taskCount: number;
}
interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  labels: string[];
  assignee: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  subtaskCount: number;
  subtasks?: Task[];
}
interface TaskPage {
  items: Task[];
  nextCursor: string | null;
}

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();

describe('projects and tasks (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let ada: TestUser; // OWNER of Acme
  let ann: TestUser; // ADMIN
  let max: TestUser; // MANAGER
  let mia: TestUser; // MEMBER
  let grace: TestUser; // OWNER of Globex
  let acme: TestOrg;
  let globex: TestOrg;
  let website: Project;

  const projects = (org: TestOrg) => `/organizations/${org.id}/projects`;
  const tasksOf = (org: TestOrg, project: { id: string }) => `${projects(org)}/${project.id}/tasks`;
  const task = (org: TestOrg, t: { id: string }) => `/organizations/${org.id}/tasks/${t.id}`;
  const body = <T>(res: { body: unknown }) => res.body as T;

  const newProject = async (name: string) =>
    body<Project>(await api.post(max, projects(acme), { name }).expect(201));
  const newTask = async (user: TestUser, project: Project, data: object) =>
    body<Task>(await api.post(user, tasksOf(acme, project), data).expect(201));
  const titles = (page: TaskPage) => page.items.map((t) => t.title).sort();

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    [ada, ann, max, mia, grace] = await Promise.all(
      ['ada', 'ann', 'max', 'mia', 'grace'].map((name) => ctx.signUp(name)),
    );
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, ann, 'ADMIN');
    await api.join(ada, acme, max, 'MANAGER');
    await api.join(ada, acme, mia, 'MEMBER');

    website = body<Project>(
      await api
        .post(max, projects(acme), { name: '  Website  ', department: 'Marketing' })
        .expect(201),
    );
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('projects', () => {
    it('are created by managers and above, with the name trimmed', () => {
      expect(website).toMatchObject({ name: 'Website', department: 'Marketing', taskCount: 0 });
    });

    it('cannot be created or changed by plain members, who can still read them', async () => {
      await api.post(mia, projects(acme), { name: 'Nope' }).expect(403);
      await api.patch(mia, `${projects(acme)}/${website.id}`, { name: 'Nope' }).expect(403);

      const list = body<Project[]>(await api.get(mia, projects(acme)).expect(200));
      expect(list.map((p) => p.id)).toContain(website.id);
      await api.get(mia, `${projects(acme)}/${website.id}`).expect(200);
    });

    it('can be edited, and null clears an optional field', async () => {
      const edited = await api
        .patch(max, `${projects(acme)}/${website.id}`, { name: 'Website 2', department: null })
        .expect(200);

      expect(edited.body).toMatchObject({ name: 'Website 2', department: null });
      await api.patch(max, `${projects(acme)}/${website.id}`, { name: 'Website' }).expect(200);
    });

    it('validate their input', async () => {
      await api.post(max, projects(acme), { name: '   ' }).expect(400);
      await api.post(max, projects(acme), { name: 'x', owner: 'me' }).expect(400);
      await api.get(max, `${projects(acme)}/not-a-uuid`).expect(400);
    });

    it('are soft deleted by admins: hidden from the API, tasks included, rows kept', async () => {
      const doomed = await newProject('Doomed');
      const t = await newTask(mia, doomed, { title: 'Goes with the project' });

      await api.del(max, `${projects(acme)}/${doomed.id}`).expect(403);
      await api.del(ann, `${projects(acme)}/${doomed.id}`).expect(204);

      await api.get(ada, `${projects(acme)}/${doomed.id}`).expect(404);
      await api.patch(ada, `${projects(acme)}/${doomed.id}`, { name: 'Zombie' }).expect(404);
      await api.get(ada, task(acme, t)).expect(404);
      const list = body<Project[]>(await api.get(ada, projects(acme)).expect(200));
      expect(list.map((p) => p.id)).not.toContain(doomed.id);

      // "Soft": the rows are still in the database, marked as deleted.
      const prisma = ctx.app.get(PrismaService);
      expect(
        (await prisma.project.findUniqueOrThrow({ where: { id: doomed.id } })).deletedAt,
      ).not.toBeNull();
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).deletedAt,
      ).not.toBeNull();
    });
  });

  describe('tasks', () => {
    it('can be created by any member, with defaults and normalized labels', async () => {
      const created = await newTask(mia, website, {
        title: '  Design homepage  ',
        labels: [' Bug ', 'BUG', 'Frontend'],
      });

      expect(created).toMatchObject({
        title: 'Design homepage',
        status: 'TODO',
        priority: 'MEDIUM',
        labels: ['bug', 'frontend'],
        createdBy: { id: mia.id },
        assignee: null,
        parentId: null,
      });
    });

    it('validate their input', async () => {
      const url = tasksOf(acme, website);

      await api.post(mia, url, { title: '' }).expect(400);
      await api.post(mia, url, { title: 'x', status: 'DONEISH' }).expect(400);
      await api.post(mia, url, { title: 'x', dueDate: 'tomorrow-ish' }).expect(400);
      // 11 different labels. (Duplicates would be merged first, so they would not count.)
      const tooMany = Array.from({ length: 11 }, (_, i) => `label-${i}`);
      await api.post(mia, url, { title: 'x', labels: tooMany }).expect(400);
      await api.post(mia, url, { title: 'x', labels: ['a'.repeat(31)] }).expect(400);
      await api.post(mia, url, { title: 'x', createdById: ada.id }).expect(400);
    });

    it('can only be assigned to members of the same organization', async () => {
      const url = tasksOf(acme, website);

      await api.post(mia, url, { title: 'x', assigneeId: grace.id }).expect(400);
      await api
        .post(mia, url, { title: 'x', assigneeId: '00000000-0000-4000-8000-000000000000' })
        .expect(400);
      const ok = await api.post(mia, url, { title: 'x', assigneeId: max.id }).expect(201);
      expect((ok.body as Task).assignee).toMatchObject({ id: max.id });
    });

    it('are updated field by field, and null clears assignee and due date', async () => {
      const t = await newTask(mia, website, {
        title: 'Update me',
        assigneeId: mia.id,
        dueDate: daysFromNow(3),
      });

      const moved = await api
        .patch(mia, task(acme, t), { status: 'IN_PROGRESS', priority: 'HIGH' })
        .expect(200);
      expect(moved.body).toMatchObject({
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        title: 'Update me',
      });

      const cleared = await api
        .patch(mia, task(acme, t), { assigneeId: null, dueDate: null })
        .expect(200);
      expect(cleared.body).toMatchObject({ assignee: null, dueDate: null });

      await api.patch(mia, task(acme, t), { title: '' }).expect(400);
      await api.patch(mia, task(acme, t), { assigneeId: grace.id }).expect(400);
    });

    it('can have subtasks, one level deep, listed with their parent', async () => {
      const parent = await newTask(mia, website, { title: 'Parent' });
      const sub = body<Task>(
        await api.post(mia, `${task(acme, parent)}/subtasks`, { title: 'Child' }).expect(201),
      );

      expect(sub).toMatchObject({ parentId: parent.id, projectId: website.id });
      await api.post(mia, `${task(acme, sub)}/subtasks`, { title: 'Grandchild' }).expect(400);

      const detail = body<Task>(await api.get(mia, task(acme, parent)).expect(200));
      expect(detail.subtaskCount).toBe(1);
      expect(detail.subtasks?.map((s) => s.title)).toEqual(['Child']);

      const topLevel = body<TaskPage>(
        await api.get(mia, `${tasksOf(acme, website)}?limit=100`).expect(200),
      );
      expect(topLevel.items.map((t) => t.id)).not.toContain(sub.id);
      const all = body<TaskPage>(
        await api.get(mia, `${tasksOf(acme, website)}?limit=100&includeSubtasks=true`).expect(200),
      );
      expect(all.items.map((t) => t.id)).toContain(sub.id);
    });

    it('are deleted by their creator or a manager, together with their subtasks', async () => {
      const mine = await newTask(mia, website, { title: 'Mine' });
      const sub = body<Task>(
        await api.post(mia, `${task(acme, mine)}/subtasks`, { title: 'Mine child' }).expect(201),
      );
      const maxs = await newTask(max, website, { title: "Max's" });

      await api.del(mia, task(acme, maxs)).expect(403);
      await api.del(mia, task(acme, mine)).expect(204);
      await api.del(max, task(acme, maxs)).expect(204);

      await api.get(mia, task(acme, mine)).expect(404);
      await api.get(mia, task(acme, sub)).expect(404);
      await api.patch(mia, task(acme, mine), { title: 'Zombie' }).expect(404);
      await api.del(mia, task(acme, mine)).expect(404);

      const prisma = ctx.app.get(PrismaService);
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: mine.id } })).deletedAt,
      ).not.toBeNull();
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: sub.id } })).deletedAt,
      ).not.toBeNull();
    });
  });

  describe('listing', () => {
    let filters: Project;

    beforeAll(async () => {
      filters = await newProject('Filters');
      await newTask(mia, filters, {
        title: 'Fix Login Bug',
        priority: 'HIGH',
        labels: ['bug', 'auth'],
        assigneeId: mia.id,
        dueDate: daysFromNow(-2),
      });
      await newTask(mia, filters, {
        title: 'Write docs',
        priority: 'LOW',
        status: 'IN_PROGRESS',
        labels: ['docs'],
        assigneeId: max.id,
        dueDate: daysFromNow(5),
      });
      await newTask(mia, filters, {
        title: 'Deploy',
        priority: 'URGENT',
        status: 'DONE',
        dueDate: daysFromNow(-2),
      });
      await newTask(mia, filters, {
        title: 'Refactor login page',
        labels: ['auth'],
        assigneeId: mia.id,
      });
    });

    const list = async (user: TestUser, query: string) =>
      body<TaskPage>(await api.get(user, `${tasksOf(acme, filters)}?${query}`).expect(200));

    it('filters by status, priority, assignee, label and title search', async () => {
      expect(titles(await list(mia, 'status=TODO'))).toEqual([
        'Fix Login Bug',
        'Refactor login page',
      ]);
      expect(titles(await list(mia, 'priority=URGENT'))).toEqual(['Deploy']);
      expect(titles(await list(mia, 'assigneeId=me'))).toEqual([
        'Fix Login Bug',
        'Refactor login page',
      ]);
      expect(titles(await list(ada, 'assigneeId=me'))).toEqual([]);
      expect(titles(await list(mia, `assigneeId=${max.id}`))).toEqual(['Write docs']);
      expect(titles(await list(mia, 'label=AUTH'))).toEqual([
        'Fix Login Bug',
        'Refactor login page',
      ]);
      expect(titles(await list(mia, 'q=LOGIN'))).toEqual(['Fix Login Bug', 'Refactor login page']);
    });

    it('filters by due date and overdue (done tasks are never overdue)', async () => {
      expect(titles(await list(mia, 'overdue=true'))).toEqual(['Fix Login Bug']);
      expect(titles(await list(mia, `dueBefore=${encodeURIComponent(daysFromNow(1))}`))).toEqual([
        'Deploy',
        'Fix Login Bug',
      ]);
    });

    it('combines filters', async () => {
      expect(titles(await list(mia, 'status=TODO&q=refactor'))).toEqual(['Refactor login page']);
      expect(titles(await list(mia, 'status=DONE&label=auth'))).toEqual([]);
    });

    it('rejects invalid filters', async () => {
      await api.get(mia, `${tasksOf(acme, filters)}?status=NOPE`).expect(400);
      await api.get(mia, `${tasksOf(acme, filters)}?assigneeId=someone`).expect(400);
      await api.get(mia, `${tasksOf(acme, filters)}?sort=title`).expect(400);
    });

    it('lists tasks across all projects of the organization', async () => {
      const all = body<TaskPage>(
        await api.get(mia, `/organizations/${acme.id}/tasks?assigneeId=me&limit=100`).expect(200),
      );

      const inProjects = new Set(all.items.map((t) => t.projectId));
      expect(inProjects.has(filters.id)).toBe(true);
      expect(all.items.every((t) => t.assignee?.id === mia.id)).toBe(true);
    });
  });

  describe('pagination', () => {
    let paging: Project;
    let everything: Task[];

    beforeAll(async () => {
      paging = await newProject('Paging');
      for (let n = 1; n <= 7; n++) {
        await newTask(mia, paging, { title: `Task ${n}` });
      }
      const all = body<TaskPage>(
        await api.get(mia, `${tasksOf(acme, paging)}?limit=100`).expect(200),
      );
      everything = all.items;
    });

    const page = async (query: string) =>
      body<TaskPage>(await api.get(mia, `${tasksOf(acme, paging)}?${query}`).expect(200));

    async function collect(order: 'asc' | 'desc') {
      const pages: TaskPage[] = [];
      let cursor: string | null = null;
      do {
        const next: TaskPage = await page(
          `limit=3&order=${order}${cursor ? `&cursor=${cursor}` : ''}`,
        );
        pages.push(next);
        cursor = next.nextCursor;
      } while (cursor);
      return pages;
    }

    it('walks through all rows in pages without gaps or repeats, newest first by default', async () => {
      const pages = await collect('desc');

      expect(pages.map((p) => p.items.length)).toEqual([3, 3, 1]);
      expect(pages[2].nextCursor).toBeNull();
      const ids = pages.flatMap((p) => p.items.map((t) => t.id));
      expect(ids).toEqual(everything.map((t) => t.id));
      expect(new Set(ids).size).toBe(7);
      expect(pages[0].items[0].title).toBe('Task 7');
    });

    it('supports ascending order', async () => {
      const ids = (await collect('asc')).flatMap((p) => p.items.map((t) => t.id));

      expect(ids).toEqual([...everything].reverse().map((t) => t.id));
    });

    it('stays stable when rows are added between page requests', async () => {
      const first = await page('limit=3');
      await newTask(mia, paging, { title: 'Arrived late' });

      const second = await page(`limit=3&cursor=${first.nextCursor}`);

      const seen = new Set(first.items.map((t) => t.id));
      expect(second.items.some((t) => seen.has(t.id))).toBe(false);
      expect(second.items.map((t) => t.title)).not.toContain('Arrived late');
    });

    it('rejects bad cursors and page sizes', async () => {
      await api.get(mia, `${tasksOf(acme, paging)}?cursor=garbage`).expect(400);
      await api.get(mia, `${tasksOf(acme, paging)}?limit=0`).expect(400);
      await api.get(mia, `${tasksOf(acme, paging)}?limit=101`).expect(400);
    });
  });

  describe('tenant isolation', () => {
    let acmeProject: Project;
    let acmeTask: Task;
    let globexProject: Project;

    beforeAll(async () => {
      acmeProject = await newProject('Acme secrets');
      acmeTask = await newTask(mia, acmeProject, { title: 'Acme secret task' });
      globexProject = body<Project>(
        await api.post(grace, projects(globex), { name: 'Globex plans' }).expect(201),
      );
    });

    it("never shows another company's projects or tasks", async () => {
      const graceProjects = body<Project[]>(await api.get(grace, projects(globex)).expect(200));
      expect(graceProjects.map((p) => p.id)).toEqual([globexProject.id]);

      const graceTasks = body<TaskPage>(
        await api.get(grace, `/organizations/${globex.id}/tasks?limit=100`).expect(200),
      );
      expect(graceTasks.items).toEqual([]);
    });

    it("blocks access to another company's routes entirely", async () => {
      await api.get(grace, `${projects(acme)}/${acmeProject.id}`).expect(404);
      await api.get(grace, tasksOf(acme, acmeProject)).expect(404);
      await api.post(grace, tasksOf(acme, acmeProject), { title: 'Intruder' }).expect(404);
      await api.patch(grace, task(acme, acmeTask), { title: 'Hacked' }).expect(404);
      await api.del(grace, task(acme, acmeTask)).expect(404);
    });

    it("cannot reach Acme's data by using Acme ids on Globex's own routes", async () => {
      await api.get(grace, `${projects(globex)}/${acmeProject.id}`).expect(404);
      await api
        .patch(grace, `${projects(globex)}/${acmeProject.id}`, { name: 'Hacked' })
        .expect(404);
      await api.del(grace, `${projects(globex)}/${acmeProject.id}`).expect(404);
      await api.post(grace, tasksOf(globex, acmeProject), { title: 'Intruder' }).expect(404);
      await api.get(grace, task(globex, acmeTask)).expect(404);
      await api.patch(grace, task(globex, acmeTask), { title: 'Hacked' }).expect(404);
      await api.del(grace, task(globex, acmeTask)).expect(404);
      await api
        .post(grace, `${task(globex, acmeTask)}/subtasks`, { title: 'Intruder' })
        .expect(404);

      // Nothing changed on Acme's side.
      const intact = body<Task>(await api.get(ada, task(acme, acmeTask)).expect(200));
      expect(intact).toMatchObject({ title: 'Acme secret task', subtaskCount: 0 });
      await api.get(ada, `${projects(acme)}/${acmeProject.id}`).expect(200);
    });

    it("cannot assign Acme's tasks to people from another company, or the reverse", async () => {
      const t = body<Task>(
        await api.post(grace, tasksOf(globex, globexProject), { title: 'Globex task' }).expect(201),
      );

      await api.patch(grace, task(globex, t), { assigneeId: mia.id }).expect(400);
      await api.patch(mia, task(acme, acmeTask), { assigneeId: grace.id }).expect(400);
    });
  });
});
