import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { JwtService } from '@nestjs/jwt';
import { io, type Socket } from 'socket.io-client';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

interface Project {
  id: string;
}
interface Task {
  id: string;
}

// A browser tab, as far as the server can tell: a Socket.IO client with an access token.
describe('realtime (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let url: string;
  let ada: TestUser; // OWNER of Acme
  let mia: TestUser; // MEMBER of Acme
  let grace: TestUser; // OWNER of Globex
  let acme: TestOrg;
  let globex: TestOrg;
  const sockets: Socket[] = [];

  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;
  const body = <T>(res: { body: unknown }) => res.body as T;
  const listen = async (context: TestContext) => {
    await context.app.listen(0);
    const { port } = (context.app.getHttpServer() as Server).address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  };

  const connect = (serverUrl: string, token: string | undefined): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(serverUrl, {
        auth: token === undefined ? {} : { token },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
    });

  const subscribe = (socket: Socket, payload: unknown) =>
    socket.emitWithAck('subscribe', payload) as Promise<{ ok: boolean; error?: string }>;

  const nextEvent = <T>(socket: Socket, event: string, timeoutMs = 3000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No "${event}" event arrived`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  // Collects what arrives for a moment, to prove that something did NOT arrive.
  const eventsDuring = async (socket: Socket, event: string, action: () => Promise<unknown>) => {
    const received: unknown[] = [];
    const listener = (payload: unknown) => received.push(payload);
    socket.on(event, listener);
    await action();
    await ctx.settle();
    await new Promise((resolve) => setTimeout(resolve, 300));
    socket.off(event, listener);
    return received;
  };

  let counter = 0;
  const newProject = async (org = acme, user = ada) =>
    body<Project>(
      await api.post(user, path(org, '/projects'), { name: `Live ${++counter}` }).expect(201),
    );
  const newTask = async (project: Project, org = acme, user = ada) =>
    body<Task>(
      await api
        .post(user, path(org, `/projects/${project.id}/tasks`), { title: `T${++counter}` })
        .expect(201),
    );

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    url = await listen(ctx);
    [ada, mia, grace] = await Promise.all(['ada', 'mia', 'grace'].map((n) => ctx.signUp(n)));
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, mia, 'MEMBER');
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('connecting', () => {
    it('needs a valid access token', async () => {
      await expect(connect(url, undefined)).rejects.toThrow('unauthorized');
      await expect(connect(url, 'not-a-token')).rejects.toThrow('unauthorized');

      const forged = await ctx.app
        .get(JwtService)
        .signAsync({ sub: ada.id }, { secret: 'another-secret-another-secret-123456' });
      await expect(connect(url, forged)).rejects.toThrow('unauthorized');

      const socket = await connect(url, ada.token);
      expect(socket.connected).toBe(true);
    });

    it('is closed by the server when the access token runs out', async () => {
      const shortLived = await ctx.app.get(JwtService).signAsync({ sub: ada.id }, { expiresIn: 1 });
      const socket = await connect(url, shortLived);

      const expired = nextEvent(socket, 'token_expired');
      const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));

      await expired;
      expect(await closed).toBe('io server disconnect');
    });
  });

  describe('subscribing', () => {
    it('lets a member follow their organization and a project in it', async () => {
      const project = await newProject();
      const socket = await connect(url, mia.token);

      expect(await subscribe(socket, { organizationId: acme.id, projectId: project.id })).toEqual({
        ok: true,
      });
    });

    it('says "not found" for other companies, unknown projects and bad input', async () => {
      const acmeProject = await newProject();
      const globexProject = await newProject(globex, grace);
      const socket = await connect(url, mia.token);
      const refused = { ok: false, error: 'Not found' };

      // Mia is not in Globex, whether or not the project exists.
      expect(await subscribe(socket, { organizationId: globex.id })).toEqual(refused);
      expect(
        await subscribe(socket, { organizationId: globex.id, projectId: globexProject.id }),
      ).toEqual(refused);
      // A project of another organization, asked for through an organization she is in.
      expect(
        await subscribe(socket, { organizationId: acme.id, projectId: globexProject.id }),
      ).toEqual(refused);
      expect(
        await subscribe(socket, {
          organizationId: acme.id,
          projectId: '00000000-0000-4000-8000-000000000000',
        }),
      ).toEqual(refused);

      expect((await subscribe(socket, { organizationId: 'nope' })).ok).toBe(false);
      expect((await subscribe(socket, { organizationId: acme.id, projectId: 5 })).ok).toBe(false);
      expect((await subscribe(socket, null)).ok).toBe(false);
      expect(acmeProject.id).toBeDefined();
    });
  });

  describe('live updates of a project', () => {
    it('tell subscribers what changed, without any content', async () => {
      const project = await newProject();
      const socket = await connect(url, mia.token);
      await subscribe(socket, { organizationId: acme.id, projectId: project.id });

      const created = nextEvent<Record<string, unknown>>(socket, 'tasks.changed');
      const task = await newTask(project);
      expect(await created).toEqual({ taskId: task.id, actorId: ada.id, kind: 'created' });

      const moved = nextEvent<Record<string, unknown>>(socket, 'tasks.changed');
      await api.post(ada, path(acme, `/tasks/${task.id}/move`), { status: 'DONE' }).expect(200);
      expect(await moved).toMatchObject({ taskId: task.id, kind: 'moved' });

      const commented = nextEvent<Record<string, unknown>>(socket, 'tasks.changed');
      await api.post(ada, path(acme, `/tasks/${task.id}/comments`), { body: 'hi' }).expect(201);
      expect(await commented).toMatchObject({ kind: 'comment' });

      const deleted = nextEvent<Record<string, unknown>>(socket, 'tasks.changed');
      await api.del(ada, path(acme, `/tasks/${task.id}`)).expect(204);
      expect(await deleted).toMatchObject({ kind: 'deleted' });
    });

    it('reach only the people subscribed to that project', async () => {
      const [watched, other] = [await newProject(), await newProject()];
      const subscribed = await connect(url, mia.token);
      const elsewhere = await connect(url, mia.token);
      const stranger = await connect(url, grace.token);
      await subscribe(subscribed, { organizationId: acme.id, projectId: watched.id });
      await subscribe(elsewhere, { organizationId: acme.id, projectId: other.id });
      await subscribe(stranger, { organizationId: globex.id }); // refused for Acme's project below
      await subscribe(stranger, { organizationId: acme.id, projectId: watched.id });

      const heard = nextEvent(subscribed, 'tasks.changed');
      const seenElsewhere: unknown[] = [];
      const seenByStranger: unknown[] = [];
      elsewhere.on('tasks.changed', (p) => seenElsewhere.push(p));
      stranger.on('tasks.changed', (p) => seenByStranger.push(p));

      await newTask(watched);
      await heard;
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(seenElsewhere).toEqual([]);
      expect(seenByStranger).toEqual([]);
    });

    it('stop when the client unsubscribes', async () => {
      const project = await newProject();
      const socket = await connect(url, mia.token);
      await subscribe(socket, { organizationId: acme.id, projectId: project.id });
      await socket.emitWithAck('unsubscribe', { projectId: project.id });

      const received = await eventsDuring(socket, 'tasks.changed', () => newTask(project));

      expect(received).toEqual([]);
    });
  });

  describe('live notifications', () => {
    it('go to the recipient only, with no subscription needed', async () => {
      const project = await newProject();
      const task = await newTask(project);
      const miaSocket = await connect(url, mia.token);
      const adaSocket = await connect(url, ada.token);

      const heard = nextEvent<{ organizationId: string }>(miaSocket, 'notifications.changed');
      const adaHeard: unknown[] = [];
      adaSocket.on('notifications.changed', (p) => adaHeard.push(p));

      await api
        .post(ada, path(acme, `/tasks/${task.id}/comments`), { body: `hey @[mia](${mia.id})` })
        .expect(201);

      expect(await heard).toEqual({ organizationId: acme.id });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(adaHeard).toEqual([]);
    });
  });

  describe('several API servers', () => {
    it('deliver an update made on one server to a browser connected to another', async () => {
      // Two servers, one Redis. The browser listens on the first; the change happens on the second.
      const second = await createTestApp();
      const secondUrl = await listen(second);
      try {
        const project = await newProject();
        const browser = await connect(url, mia.token);
        await subscribe(browser, { organizationId: acme.id, projectId: project.id });
        const heard = nextEvent<Record<string, unknown>>(browser, 'tasks.changed');

        const res = await second
          .http()
          .post(`/api/v1/organizations/${acme.id}/projects/${project.id}/tasks`)
          .set('Authorization', `Bearer ${ada.token}`)
          .send({ title: 'Made on the other server' })
          .expect(201);

        expect(await heard).toMatchObject({
          taskId: (res.body as Task).id,
          kind: 'created',
          actorId: ada.id,
        });
        expect(secondUrl).not.toBe(url);
      } finally {
        await second.app.close();
      }
    });
  });
});
