import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

interface Project {
  id: string;
}
interface Task {
  id: string;
  title: string;
}
interface Comment {
  id: string;
  body: string;
  editedAt: string | null;
  author: { id: string; name: string };
}
interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
interface Notification {
  id: string;
  type: 'MENTION' | 'ASSIGNED';
  readAt: string | null;
  actor: { id: string; name: string };
  task: { id: string; title: string };
  commentId: string | null;
}
interface ActivityItem {
  id: string;
  type: string;
  task: { id: string; title: string; projectId: string };
  actor: { name: string } | null;
}

describe('collaboration (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let api: ReturnType<typeof apiFor>;
  let ada: TestUser; // OWNER of Acme
  let max: TestUser; // MANAGER
  let mia: TestUser; // MEMBER
  let leo: TestUser; // MEMBER
  let grace: TestUser; // OWNER of Globex, not a member of Acme
  let acme: TestOrg;
  let globex: TestOrg;

  const body = <T>(res: { body: unknown }) => res.body as T;
  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;
  const mention = (user: TestUser) => `@[${user.name}](${user.id})`;

  let counter = 0;
  const newProject = async () =>
    body<Project>(
      await api.post(max, path(acme, '/projects'), { name: `Collab ${++counter}` }).expect(201),
    );
  const newTask = async (project: Project, title = `Task ${++counter}`, extra: object = {}) =>
    body<Task>(
      await api
        .post(mia, path(acme, `/projects/${project.id}/tasks`), { title, ...extra })
        .expect(201),
    );
  const comment = async (user: TestUser, task: Task, text: string) =>
    body<Comment>(
      await api.post(user, path(acme, `/tasks/${task.id}/comments`), { body: text }).expect(201),
    );
  const notifications = async (user: TestUser, query = '') =>
    body<Page<Notification>>(await api.get(user, path(acme, `/notifications${query}`)).expect(200));
  const unread = async (user: TestUser) =>
    body<{ count: number }>(
      await api.get(user, path(acme, '/notifications/unread-count')).expect(200),
    ).count;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    prisma = ctx.app.get(PrismaService);
    [ada, max, mia, leo, grace] = await Promise.all(
      ['ada', 'max', 'mia', 'leo', 'grace'].map((name) => ctx.signUp(name)),
    );
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, max, 'MANAGER');
    await api.join(ada, acme, mia, 'MEMBER');
    await api.join(ada, acme, leo, 'MEMBER');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('comments', () => {
    it('are listed oldest first, with their author, and paginate', async () => {
      const task = await newTask(await newProject());
      await comment(mia, task, 'first');
      await comment(leo, task, 'second');
      await comment(mia, task, 'third');

      const page1 = body<Page<Comment>>(
        await api.get(ada, path(acme, `/tasks/${task.id}/comments?limit=2`)).expect(200),
      );
      expect(page1.items.map((c) => c.body)).toEqual(['first', 'second']);
      expect(page1.items[0].author).toEqual({ id: mia.id, name: 'mia' });
      expect(page1.nextCursor).not.toBeNull();

      const page2 = body<Page<Comment>>(
        await api
          .get(ada, path(acme, `/tasks/${task.id}/comments?limit=2&cursor=${page1.nextCursor}`))
          .expect(200),
      );
      expect(page2.items.map((c) => c.body)).toEqual(['third']);
      expect(page2.nextCursor).toBeNull();
    });

    it('must have text, and not too much of it', async () => {
      const task = await newTask(await newProject());
      const url = path(acme, `/tasks/${task.id}/comments`);

      await api.post(mia, url, { body: '' }).expect(400);
      await api.post(mia, url, { body: '   \n ' }).expect(400);
      await api.post(mia, url, {}).expect(400);
      await api.post(mia, url, { body: 'x'.repeat(5001) }).expect(400);
      await api.post(mia, url, { body: 'x'.repeat(5000) }).expect(201);
    });

    it('can be edited by their author only, and show that they were edited', async () => {
      const task = await newTask(await newProject());
      const c = await comment(mia, task, 'draft');
      const url = path(acme, `/tasks/${task.id}/comments/${c.id}`);

      const edited = body<Comment>(await api.patch(mia, url, { body: 'final' }).expect(200));
      expect(edited.body).toBe('final');
      expect(edited.editedAt).not.toBeNull();

      await api.patch(leo, url, { body: 'hijack' }).expect(403);
      await api.patch(max, url, { body: 'hijack' }).expect(403); // not even a manager
      await api.patch(mia, url, { body: '' }).expect(400);
    });

    it('can be deleted by their author or by a manager, not by other members', async () => {
      const task = await newTask(await newProject());
      const mine = await comment(mia, task, 'mine');
      const other = await comment(mia, task, 'other');
      const third = await comment(mia, task, 'third');
      const url = (c: Comment) => path(acme, `/tasks/${task.id}/comments/${c.id}`);

      await api.del(leo, url(mine)).expect(403);
      await api.del(mia, url(mine)).expect(204);
      await api.del(max, url(other)).expect(204);
      await api.del(ada, url(mine)).expect(404); // already gone
      await api.patch(mia, url(mine), { body: 'zombie' }).expect(404);

      const left = body<Page<Comment>>(
        await api.get(ada, path(acme, `/tasks/${task.id}/comments`)).expect(200),
      );
      expect(left.items.map((c) => c.id)).toEqual([third.id]);
    });

    it('only exist on live tasks of your own company', async () => {
      const project = await newProject();
      const task = await newTask(project);
      const gone = await newTask(project);
      await api.del(mia, path(acme, `/tasks/${gone.id}`)).expect(204);
      const c = await comment(mia, task, 'hello');

      await api.post(mia, path(acme, `/tasks/${gone.id}/comments`), { body: 'x' }).expect(404);
      await api.get(mia, path(acme, `/tasks/${gone.id}/comments`)).expect(404);
      // Grace is a stranger to Acme, and a comment of Acme cannot be reached through Globex.
      await api.get(grace, path(acme, `/tasks/${task.id}/comments`)).expect(404);
      await api.post(grace, path(acme, `/tasks/${task.id}/comments`), { body: 'x' }).expect(404);
      await api.get(grace, path(globex, `/tasks/${task.id}/comments`)).expect(404);
      await api
        .patch(grace, path(globex, `/tasks/${task.id}/comments/${c.id}`), { body: 'x' })
        .expect(404);
    });

    it('are part of the task history', async () => {
      const task = await newTask(await newProject());
      await comment(mia, task, 'noted');

      const history = body<Page<{ type: string; actor: { name: string } }>>(
        await api.get(mia, path(acme, `/tasks/${task.id}/history`)).expect(200),
      );
      expect(history.items.map((e) => e.type)).toEqual(['COMMENT_ADDED', 'CREATED']);
      expect(history.items[0].actor.name).toBe('mia');
    });
  });

  describe('mentions', () => {
    it('notify the mentioned member, once, and never the author', async () => {
      const task = await newTask(await newProject(), 'Mention me');
      const before = await unread(ada);

      const c = await comment(
        mia,
        task,
        `${mention(ada)} and again ${mention(ada)}, also me ${mention(mia)}`,
      );

      expect(await unread(ada)).toBe(before + 1);
      expect(await unread(mia)).toBe(0);
      const [note] = (await notifications(ada)).items;
      expect(note).toMatchObject({
        type: 'MENTION',
        readAt: null,
        actor: { id: mia.id, name: 'mia' },
        task: { id: task.id, title: 'Mention me' },
        commentId: c.id,
      });
    });

    it('ignore people from other companies and made-up ids, without an error', async () => {
      const task = await newTask(await newProject());
      // Separate comments: a bad id must not hide what happens to a real outsider.
      await comment(mia, task, `${mention(grace)}`);
      await comment(mia, task, '@[Nobody](00000000-0000-4000-8000-000000000000) and plain @ada');

      // Looked at in the database: through the API, Grace could only ever see Globex's notifications.
      expect(await prisma.notification.count({ where: { userId: grace.id } })).toBe(0);
      expect(await prisma.notification.count({ where: { taskId: task.id } })).toBe(0);
    });

    it('notify only the people newly mentioned by an edit', async () => {
      const task = await newTask(await newProject());
      const c = await comment(mia, task, `Hello ${mention(ada)}`);
      const adaBefore = await unread(ada);
      const leoBefore = await unread(leo);
      const url = path(acme, `/tasks/${task.id}/comments/${c.id}`);

      await api.patch(mia, url, { body: `Hello ${mention(ada)} ${mention(leo)}` }).expect(200);

      expect(await unread(ada)).toBe(adaBefore); // already mentioned before
      expect(await unread(leo)).toBe(leoBefore + 1);

      await api.patch(mia, url, { body: `Typo fixed ${mention(ada)} ${mention(leo)}` }).expect(200);
      expect(await unread(leo)).toBe(leoBefore + 1); // still just one
    });
  });

  describe('assignment notifications', () => {
    it('go to the new assignee, but not when assigning yourself', async () => {
      const project = await newProject();
      const adaBefore = await unread(ada);
      const miaBefore = await unread(mia);

      const withAssignee = await newTask(project, 'Assigned at creation', { assigneeId: ada.id });
      expect(await unread(ada)).toBe(adaBefore + 1);

      await newTask(project, 'Mine', { assigneeId: mia.id }); // mia creates and takes it
      expect(await unread(mia)).toBe(miaBefore);

      const task = await newTask(project, 'Later');
      await api.patch(mia, path(acme, `/tasks/${task.id}`), { assigneeId: leo.id }).expect(200);
      await api.patch(mia, path(acme, `/tasks/${task.id}`), { assigneeId: leo.id }).expect(200); // same again
      await api.patch(mia, path(acme, `/tasks/${task.id}`), { title: 'Renamed' }).expect(200);

      const leoNotes = (await notifications(leo)).items.filter((n) => n.task.id === task.id);
      expect(leoNotes).toHaveLength(1);
      expect(leoNotes[0]).toMatchObject({ type: 'ASSIGNED', actor: { name: 'mia' } });
      expect(withAssignee.id).toBeDefined();
    });
  });

  describe('notification centre', () => {
    it('marks one or all as read, filters, and paginates', async () => {
      const task = await newTask(await newProject());
      for (let i = 0; i < 3; i++) {
        await comment(mia, task, `ping ${i} ${mention(max)}`);
      }
      const start = await unread(max);
      expect(start).toBeGreaterThanOrEqual(3);

      const [newest, second] = (await notifications(max)).items;
      await api.post(max, path(acme, `/notifications/${newest.id}/read`)).expect(204);
      await api.post(max, path(acme, `/notifications/${newest.id}/read`)).expect(204); // twice is fine
      expect(await unread(max)).toBe(start - 1);

      const unreadOnly = await notifications(max, '?unreadOnly=true');
      expect(unreadOnly.items.map((n) => n.id)).not.toContain(newest.id);
      expect(unreadOnly.items.map((n) => n.id)).toContain(second.id);
      expect(
        (await notifications(max)).items.find((n) => n.id === newest.id)!.readAt,
      ).not.toBeNull();

      const page1 = await notifications(max, '?limit=2');
      expect(page1.items).toHaveLength(2);
      const page2 = await notifications(max, `?limit=2&cursor=${page1.nextCursor}`);
      expect(page2.items.map((n) => n.id)).not.toContain(page1.items[0].id);

      const all = body<{ updated: number }>(
        await api.post(max, path(acme, '/notifications/read-all')).expect(200),
      );
      expect(all.updated).toBe(start - 1);
      expect(await unread(max)).toBe(0);
    });

    it('are private to their recipient', async () => {
      const task = await newTask(await newProject());
      await comment(mia, task, `psst ${mention(leo)}`);
      const [note] = (await notifications(leo)).items;

      expect((await notifications(ada)).items.map((n) => n.id)).not.toContain(note.id);
      await api.post(ada, path(acme, `/notifications/${note.id}/read`)).expect(404);
      await api.post(grace, path(acme, `/notifications/${note.id}/read`)).expect(404);
      await api.post(grace, path(globex, `/notifications/${note.id}/read`)).expect(404);
      await api.get(grace, path(acme, '/notifications')).expect(404);

      // ada's read-all did not touch leo's.
      await api.post(ada, path(acme, '/notifications/read-all')).expect(200);
      expect((await notifications(leo)).items.find((n) => n.id === note.id)!.readAt).toBeNull();
    });

    it('disappear with their task', async () => {
      const task = await newTask(await newProject(), 'Short lived');
      await comment(mia, task, `${mention(leo)}`);
      expect((await notifications(leo)).items.some((n) => n.task.id === task.id)).toBe(true);

      await api.del(mia, path(acme, `/tasks/${task.id}`)).expect(204);

      expect((await notifications(leo)).items.some((n) => n.task.id === task.id)).toBe(false);
    });
  });

  describe('activity feed', () => {
    it('lists what happened in a project, newest first, comments included', async () => {
      const project = await newProject();
      const task = await newTask(project, 'Feed me');
      await comment(leo, task, 'a comment');
      await api.patch(mia, path(acme, `/tasks/${task.id}`), { status: 'IN_PROGRESS' }).expect(200);

      const feed = body<Page<ActivityItem>>(
        await api.get(ada, path(acme, `/projects/${project.id}/activity`)).expect(200),
      );

      expect(feed.items.map((i) => i.type)).toEqual(['UPDATED', 'COMMENT_ADDED', 'CREATED']);
      expect(feed.items.map((i) => i.actor?.name)).toEqual(['mia', 'leo', 'mia']);
      expect(feed.items[0].task).toEqual({ id: task.id, title: 'Feed me', projectId: project.id });
    });

    it('keeps projects apart, and the organization feed shows all of them', async () => {
      const [p1, p2] = [await newProject(), await newProject()];
      await newTask(p1, 'In one');
      await newTask(p2, 'In two');

      const one = body<Page<ActivityItem>>(
        await api.get(ada, path(acme, `/projects/${p1.id}/activity`)).expect(200),
      );
      expect(one.items.map((i) => i.task.title)).toEqual(['In one']);

      const org = body<Page<ActivityItem>>(
        await api.get(ada, path(acme, '/activity?limit=100')).expect(200),
      );
      const titles = org.items.map((i) => i.task.title);
      expect(titles).toEqual(expect.arrayContaining(['In one', 'In two']));
      expect(titles.indexOf('In two')).toBeLessThan(titles.indexOf('In one')); // newest first
    });

    it('paginates and hides deleted tasks', async () => {
      const project = await newProject();
      const keep = await newTask(project, 'Keep');
      const gone = await newTask(project, 'Gone');
      await comment(mia, keep, 'one');
      await comment(mia, keep, 'two');
      await api.del(mia, path(acme, `/tasks/${gone.id}`)).expect(204);
      const url = path(acme, `/projects/${project.id}/activity`);

      const page1 = body<Page<ActivityItem>>(await api.get(ada, `${url}?limit=2`).expect(200));
      expect(page1.items).toHaveLength(2);
      const page2 = body<Page<ActivityItem>>(
        await api.get(ada, `${url}?limit=2&cursor=${page1.nextCursor}`).expect(200),
      );
      const all = [...page1.items, ...page2.items];

      expect(all.map((i) => i.task.title)).not.toContain('Gone');
      expect(all.map((i) => i.type)).toEqual(['COMMENT_ADDED', 'COMMENT_ADDED', 'CREATED']);
      expect(page2.nextCursor).toBeNull();
    });

    it('is closed to strangers and unknown projects', async () => {
      const project = await newProject();

      await api.get(grace, path(acme, '/activity')).expect(404);
      await api.get(grace, path(globex, `/projects/${project.id}/activity`)).expect(404);
      await api
        .get(ada, path(acme, '/projects/00000000-0000-4000-8000-000000000000/activity'))
        .expect(404);
    });
  });

  describe('domain events', () => {
    it('are published after task changes, with what a listener needs', async () => {
      const emitter = ctx.app.get(EventEmitter2);
      const seen: { name: string; payload: Record<string, unknown> }[] = [];
      const record = (name: string) => (payload: Record<string, unknown>) =>
        seen.push({ name, payload });
      const listeners = ['task.created', 'task.status_changed'].map((name) => {
        const listener = record(name);
        emitter.on(name, listener);
        return { name, listener };
      });

      try {
        const project = await newProject();
        const task = await newTask(project);
        await api.post(mia, path(acme, `/tasks/${task.id}/move`), { status: 'DONE' }).expect(200);
        await api.post(mia, path(acme, `/tasks/${task.id}/move`), { status: 'DONE' }).expect(200);

        expect(seen.map((e) => e.name)).toEqual(['task.created', 'task.status_changed']); // no event for a no-op
        expect(seen[1].payload).toMatchObject({
          organizationId: acme.id,
          actorId: mia.id,
          taskId: task.id,
          projectId: project.id,
          from: 'TODO',
          to: 'DONE',
        });
      } finally {
        for (const { name, listener } of listeners) emitter.off(name, listener);
      }
    });

    it('never fail a request when a listener breaks', async () => {
      const emitter = ctx.app.get(EventEmitter2);
      const broken = () => {
        throw new Error('listener exploded');
      };
      emitter.on('task.created', broken);
      try {
        const project = await newProject();
        const res = await api
          .post(mia, path(acme, `/projects/${project.id}/tasks`), { title: 'Still created' })
          .expect(201);
        expect(body<Task>(res).title).toBe('Still created');
      } finally {
        emitter.off('task.created', broken);
      }
    });
  });
});
