import type { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Env } from '../src/config/env';
import { AttachmentsProcessor, PURGE_JOB } from '../src/attachments/attachments.processor';
import { AttachmentsService, PENDING_TTL_MS } from '../src/attachments/attachments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { QueueName, QueuesService } from '../src/queues/queues.service';
import { StorageService } from '../src/storage/storage.service';
import { apiFor, createTestApp, type TestContext, type TestOrg, type TestUser } from './helpers';

interface Project {
  id: string;
}
interface Task {
  id: string;
}
interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: { id: string; name: string };
}
interface Created {
  attachment: Attachment;
  upload: { url: string; method: string; headers: Record<string, string>; expiresAt: string };
}

const MIB = 1024 * 1024;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake image payload'),
]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n');
const TEXT = Buffer.from('plain notes\nsecond line\n');

// Real object storage (a SeaweedFS container) and real uploads: the file goes to the signed link
// exactly as a browser would send it.
describe('attachments (e2e)', () => {
  let ctx: TestContext;
  let api: ReturnType<typeof apiFor>;
  let prisma: PrismaService;
  let storage: StorageService;
  let ada: TestUser; // OWNER of Acme
  let max: TestUser; // MANAGER
  let mia: TestUser; // MEMBER
  let leo: TestUser; // MEMBER
  let grace: TestUser; // OWNER of Globex
  let acme: TestOrg;
  let globex: TestOrg;
  let project: Project;

  const body = <T>(res: { body: unknown }) => res.body as T;
  const path = (org: TestOrg, suffix: string) => `/organizations/${org.id}${suffix}`;

  let counter = 0;
  const newTask = async () =>
    body<Task>(
      await api
        .post(mia, path(acme, `/projects/${project.id}/tasks`), { title: `T${++counter}` })
        .expect(201),
    );

  const announce = (
    user: TestUser,
    task: Task,
    file: { fileName: string; contentType: string; size: number },
    org = acme,
  ) => api.post(user, path(org, `/tasks/${task.id}/attachments`), file);

  const put = (created: Created, data: Buffer, headers: Record<string, string> = {}) =>
    fetch(created.upload.url, {
      method: 'PUT',
      headers: { ...created.upload.headers, ...headers },
      body: new Uint8Array(data),
    });

  // announce -> upload -> complete, the way the web app does it
  const attach = async (
    user: TestUser,
    task: Task,
    data: Buffer,
    options: { fileName?: string; contentType?: string } = {},
  ) => {
    const created = body<Created>(
      await announce(user, task, {
        fileName: options.fileName ?? 'notes.txt',
        contentType: options.contentType ?? 'text/plain',
        size: data.length,
      }).expect(201),
    );
    expect((await put(created, data)).status).toBe(200);
    const done = body<Attachment>(
      await api
        .post(user, path(acme, `/attachments/${created.attachment.id}/complete`))
        .expect(200),
    );
    return { created, done };
  };

  const row = (id: string) => prisma.attachment.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = apiFor(ctx);
    prisma = ctx.app.get(PrismaService);
    storage = ctx.app.get(StorageService);
    [ada, max, mia, leo, grace] = await Promise.all(
      ['ada', 'max', 'mia', 'leo', 'grace'].map((n) => ctx.signUp(n)),
    );
    acme = await api.createOrg(ada, 'Acme');
    globex = await api.createOrg(grace, 'Globex');
    await api.join(ada, acme, max, 'MANAGER');
    await api.join(ada, acme, mia, 'MEMBER');
    await api.join(ada, acme, leo, 'MEMBER');
    project = body<Project>(
      await api.post(max, path(acme, '/projects'), { name: 'Files' }).expect(201),
    );
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('the whole flow', () => {
    it('announce, upload straight to storage, complete, list, download, delete', async () => {
      const task = await newTask();
      const { created, done } = await attach(mia, task, PDF, {
        fileName: 'Quarterly report.pdf',
        contentType: 'application/pdf',
      });

      expect(new URL(created.upload.url).origin).toBe('http://localhost:8333'); // storage, not the API
      expect(created.upload.method).toBe('PUT');
      expect(done).toMatchObject({
        fileName: 'Quarterly report.pdf',
        contentType: 'application/pdf',
        size: PDF.length,
        uploadedBy: { id: mia.id },
      });

      const list = body<Attachment[]>(
        await api.get(leo, path(acme, `/tasks/${task.id}/attachments`)).expect(200),
      );
      expect(list.map((a) => a.id)).toEqual([done.id]);

      const link = body<{ url: string }>(
        await api.get(leo, path(acme, `/attachments/${done.id}/download`)).expect(200),
      );
      const downloaded = await fetch(link.url);
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(await downloaded.arrayBuffer()).equals(PDF)).toBe(true);
      expect(downloaded.headers.get('content-disposition')).toMatch(
        /^attachment; filename="Quarterly report\.pdf"/,
      );
      expect(downloaded.headers.get('content-type')).toBe('application/pdf');

      await api.del(mia, path(acme, `/attachments/${done.id}`)).expect(204);
      expect(
        await storage.head(
          (await prisma.attachment.findMany({ where: { id: done.id } }))[0]?.storageKey ?? 'gone',
        ),
      ).toBeNull();
      expect(
        body<Attachment[]>(
          await api.get(mia, path(acme, `/tasks/${task.id}/attachments`)).expect(200),
        ),
      ).toEqual([]);
    });

    it('stores the file under a path the server chose, never under the name the user gave', async () => {
      const task = await newTask();
      const { done } = await attach(mia, task, TEXT, { fileName: '../../etc/passwd' });

      const stored = await row(done.id);
      expect(stored.storageKey).toMatch(
        new RegExp(`^orgs/${acme.id}/tasks/${task.id}/[0-9a-f-]{36}$`),
      );
      expect(done.fileName).toBe('_.._etc_passwd'); // shown name is cleaned, and only for display
      expect(await storage.list(`orgs/${acme.id}/tasks/${task.id}/`)).toContain(stored.storageKey);
    });

    it('finishing twice is harmless', async () => {
      const task = await newTask();
      const { done } = await attach(mia, task, TEXT);

      const again = await api.post(mia, path(acme, `/attachments/${done.id}/complete`)).expect(200);

      expect(body<Attachment>(again).id).toBe(done.id);
    });
  });

  describe('what can be announced', () => {
    it('refuses types a browser could run, and bad sizes', async () => {
      const task = await newTask();
      const ok = { fileName: 'a.txt', contentType: 'text/plain', size: 10 };

      for (const contentType of [
        'text/html',
        'image/svg+xml',
        'application/javascript',
        'application/octet-stream',
        'TEXT/PLAIN',
        '',
      ]) {
        await announce(mia, task, { ...ok, contentType }).expect(400);
      }
      await announce(mia, task, { ...ok, size: 0 }).expect(400);
      await announce(mia, task, { ...ok, size: 10 * MIB + 1 }).expect(400);
      await announce(mia, task, { ...ok, size: 1.5 }).expect(400);
      await announce(mia, task, { ...ok, fileName: '' }).expect(400);
      await announce(mia, task, { ...ok, fileName: 'x'.repeat(256) }).expect(400);
      await api
        .post(mia, path(acme, `/tasks/${task.id}/attachments`), { ...ok, extra: 1 })
        .expect(400);
      await announce(mia, task, { ...ok, size: 10 * MIB }).expect(201); // the limit itself is allowed

      expect(await prisma.attachment.count({ where: { taskId: task.id } })).toBe(1);
    });

    it('allows at most 25 attachments per task', async () => {
      const task = await newTask();
      for (let i = 0; i < 25; i++) {
        await announce(mia, task, {
          fileName: `f${i}.txt`,
          contentType: 'text/plain',
          size: 5,
        }).expect(201);
      }

      await announce(mia, task, {
        fileName: 'one-too-many.txt',
        contentType: 'text/plain',
        size: 5,
      }).expect(409);
    });
  });

  describe('storage refuses what was not announced', () => {
    it('rejects a different type, a different size and a tampered link', async () => {
      const task = await newTask();
      const created = body<Created>(
        await announce(mia, task, {
          fileName: 'a.png',
          contentType: 'image/png',
          size: PNG.length,
        }).expect(201),
      );

      // The type and the exact length are part of the signed link.
      expect((await put(created, PNG, { 'Content-Type': 'text/html' })).status).toBe(403);
      expect((await put(created, Buffer.concat([PNG, Buffer.from('more')]))).status).toBe(403);
      const tampered = created.upload.url.replace(
        /X-Amz-Signature=[0-9a-f]+/,
        'X-Amz-Signature=00ff',
      );
      expect(
        (
          await fetch(tampered, {
            method: 'PUT',
            headers: created.upload.headers,
            body: new Uint8Array(PNG),
          })
        ).status,
      ).toBe(403);
      // A link for one file cannot be used for another place.
      const elsewhere = created.upload.url.replace(/(\/[0-9a-f-]{36})\?/, '/other-file?');
      expect(
        (
          await fetch(elsewhere, {
            method: 'PUT',
            headers: created.upload.headers,
            body: new Uint8Array(PNG),
          })
        ).status,
      ).toBe(403);

      expect((await put(created, PNG)).status).toBe(200); // the real one still works
    });
  });

  describe('checking what arrived', () => {
    it('cannot be completed before anything was uploaded', async () => {
      const task = await newTask();
      const created = body<Created>(
        await announce(mia, task, { fileName: 'a.txt', contentType: 'text/plain', size: 4 }).expect(
          201,
        ),
      );

      await api.post(mia, path(acme, `/attachments/${created.attachment.id}/complete`)).expect(409);

      expect((await row(created.attachment.id)).status).toBe('PENDING');
    });

    it('refuses a file whose content is not what it claims to be, and removes it', async () => {
      const task = await newTask();
      const html = Buffer.from('<html><script>steal()</script></html>');
      const created = body<Created>(
        await announce(mia, task, {
          fileName: 'cute.png',
          contentType: 'image/png',
          size: html.length,
        }).expect(201),
      );
      expect((await put(created, html)).status).toBe(200); // storage cannot tell; we can
      const key = (await row(created.attachment.id)).storageKey;

      const res = await api
        .post(mia, path(acme, `/attachments/${created.attachment.id}/complete`))
        .expect(400);

      expect((res.body as { message: string }).message).toMatch(/does not match its type/);
      expect(await prisma.attachment.count({ where: { id: created.attachment.id } })).toBe(0);
      expect(await storage.head(key)).toBeNull();
    });

    it('refuses a file of another size than announced, even if storage were told otherwise', async () => {
      const task = await newTask();
      const created = body<Created>(
        await announce(mia, task, { fileName: 'a.txt', contentType: 'text/plain', size: 4 }).expect(
          201,
        ),
      );
      const stored = await row(created.attachment.id);
      // A link for the same place, signed for a different size (storage would take it).
      const other = await storage.presignUpload({
        key: stored.storageKey,
        contentType: 'text/plain',
        size: TEXT.length,
      });
      expect(
        (
          await fetch(other.url, {
            method: 'PUT',
            headers: other.headers,
            body: new Uint8Array(TEXT),
          })
        ).status,
      ).toBe(200);

      const res = await api
        .post(mia, path(acme, `/attachments/${created.attachment.id}/complete`))
        .expect(400);

      expect((res.body as { message: string }).message).toMatch(/size/);
      expect(await storage.head(stored.storageKey)).toBeNull();
      expect(await prisma.attachment.count({ where: { id: created.attachment.id } })).toBe(0);
    });

    it('can be finished only by the person who started the upload', async () => {
      const task = await newTask();
      const created = body<Created>(
        await announce(mia, task, {
          fileName: 'a.txt',
          contentType: 'text/plain',
          size: TEXT.length,
        }).expect(201),
      );
      await put(created, TEXT);

      await api.post(leo, path(acme, `/attachments/${created.attachment.id}/complete`)).expect(403);
      await api.post(ada, path(acme, `/attachments/${created.attachment.id}/complete`)).expect(403);
      await api.post(mia, path(acme, `/attachments/${created.attachment.id}/complete`)).expect(200);
    });
  });

  describe('downloading', () => {
    it('only offers finished files, as downloads, never as pages', async () => {
      const task = await newTask();
      const pending = body<Created>(
        await announce(mia, task, { fileName: 'a.txt', contentType: 'text/plain', size: 3 }).expect(
          201,
        ),
      );
      await api.get(mia, path(acme, `/attachments/${pending.attachment.id}/download`)).expect(404);
      expect(
        body<Attachment[]>(
          await api.get(mia, path(acme, `/tasks/${task.id}/attachments`)).expect(200),
        ),
      ).toEqual([]);

      const { done } = await attach(mia, task, TEXT, { fileName: 'tricky".html\r\nX: y' });
      const link = body<{ url: string }>(
        await api.get(mia, path(acme, `/attachments/${done.id}/download`)).expect(200),
      );
      const res = await fetch(link.url);

      expect(res.headers.get('content-disposition')).toMatch(/^attachment; /);
      expect(res.headers.get('content-disposition')).not.toMatch(/[\r\n]/);
      expect(res.headers.get('content-type')).toBe('text/plain'); // our checked type, not the name's
    });

    it('stops working for tasks that were deleted', async () => {
      const task = await newTask();
      const { done } = await attach(mia, task, TEXT);
      await api.del(mia, path(acme, `/tasks/${task.id}`)).expect(204);

      await api.get(mia, path(acme, `/attachments/${done.id}/download`)).expect(404);
      await api.get(mia, path(acme, `/tasks/${task.id}/attachments`)).expect(404);
    });
  });

  describe('removing', () => {
    it('is for whoever attached it and for managers, not for other members', async () => {
      const task = await newTask();
      const [mine, others, third] = [
        (await attach(mia, task, TEXT)).done,
        (await attach(mia, task, TEXT)).done,
        (await attach(mia, task, TEXT)).done,
      ];

      await api.del(leo, path(acme, `/attachments/${mine.id}`)).expect(403);
      await api.del(mia, path(acme, `/attachments/${mine.id}`)).expect(204);
      await api.del(max, path(acme, `/attachments/${others.id}`)).expect(204);
      await api.del(ada, path(acme, `/attachments/${third.id}`)).expect(204);
      await api.del(mia, path(acme, `/attachments/${mine.id}`)).expect(404);
      expect(await storage.list(`orgs/${acme.id}/tasks/${task.id}/`)).toEqual([]);
    });
  });

  describe('tenant isolation', () => {
    it("cannot be reached through another company, and Globex cannot touch Acme's files", async () => {
      const task = await newTask();
      const { done } = await attach(mia, task, TEXT);
      const globexProject = body<Project>(
        await api.post(grace, path(globex, '/projects'), { name: 'G' }).expect(201),
      );
      const globexTask = body<Task>(
        await api
          .post(grace, path(globex, `/projects/${globexProject.id}/tasks`), { title: 'G' })
          .expect(201),
      );

      // Not a member of Acme:
      await api.get(grace, path(acme, `/tasks/${task.id}/attachments`)).expect(404);
      await api.get(grace, path(acme, `/attachments/${done.id}/download`)).expect(404);
      await api.del(grace, path(acme, `/attachments/${done.id}`)).expect(404);
      // Through her own organization, with Acme's ids:
      await api.get(grace, path(globex, `/attachments/${done.id}/download`)).expect(404);
      await api.del(grace, path(globex, `/attachments/${done.id}`)).expect(404);
      await api.post(grace, path(globex, `/attachments/${done.id}/complete`)).expect(404);
      await announce(
        grace,
        task,
        { fileName: 'a.txt', contentType: 'text/plain', size: 1 },
        globex,
      ).expect(404);
      await announce(
        grace,
        globexTask,
        { fileName: 'a.txt', contentType: 'text/plain', size: 1 },
        globex,
      ).expect(201);

      expect(await row(done.id)).toBeTruthy(); // untouched
    });

    it('are all deleted from storage when their organization is deleted', async () => {
      const org = await api.createOrg(ada, 'Short Lived');
      const p = body<Project>(
        await api.post(ada, path(org, '/projects'), { name: 'P' }).expect(201),
      );
      const t = body<Task>(
        await api.post(ada, path(org, `/projects/${p.id}/tasks`), { title: 'T' }).expect(201),
      );
      const created = body<Created>(
        await announce(
          ada,
          t,
          { fileName: 'a.txt', contentType: 'text/plain', size: TEXT.length },
          org,
        ).expect(201),
      );
      await put(created, TEXT);
      await api.post(ada, path(org, `/attachments/${created.attachment.id}/complete`)).expect(200);
      expect(await storage.list(`orgs/${org.id}/`)).toHaveLength(1);

      await api.del(ada, path(org, '')).expect(204);

      expect(await storage.list(`orgs/${org.id}/`)).toEqual([]);
    });
  });

  describe('audit, live updates and clean-up', () => {
    it('records who attached and removed what', async () => {
      const task = await newTask();
      const { done } = await attach(mia, task, TEXT);
      await api.del(max, path(acme, `/attachments/${done.id}`)).expect(204);

      const entries = await prisma.auditLog.findMany({
        where: { targetId: done.id },
        orderBy: { createdAt: 'asc' },
      });

      expect(entries.map((e) => [e.action, e.actorId])).toEqual([
        ['attachment.added', mia.id],
        ['attachment.deleted', max.id],
      ]);
    });

    it('tells open boards that a task changed', async () => {
      const task = await newTask();
      const seen: unknown[] = [];
      const listener = (payload: unknown) => seen.push(payload);
      ctx.app.get(EventEmitter2).on('task.changed', listener);
      try {
        await attach(mia, task, TEXT);
      } finally {
        ctx.app.get(EventEmitter2).off('task.changed', listener);
      }

      expect(seen).toContainEqual(expect.objectContaining({ taskId: task.id, kind: 'attachment' }));
    });

    it('removes uploads that were never finished, and only those', async () => {
      const task = await newTask();
      const stale = body<Created>(
        await announce(mia, task, {
          fileName: 'a.txt',
          contentType: 'text/plain',
          size: TEXT.length,
        }).expect(201),
      );
      await put(stale, TEXT); // uploaded, but never completed
      const fresh = body<Created>(
        await announce(mia, task, { fileName: 'b.txt', contentType: 'text/plain', size: 3 }).expect(
          201,
        ),
      );
      const { done } = await attach(mia, task, TEXT);
      const old = new Date(Date.now() - PENDING_TTL_MS - 60_000);
      await prisma.attachment.update({
        where: { id: stale.attachment.id },
        data: { createdAt: old },
      });
      await prisma.attachment.update({ where: { id: done.id }, data: { createdAt: old } }); // old but finished
      const staleKey = (await row(stale.attachment.id)).storageKey;

      const purged = await ctx.app.get(AttachmentsService).purgeStaleUploads();

      expect(purged).toBeGreaterThanOrEqual(1);
      expect(await prisma.attachment.count({ where: { id: stale.attachment.id } })).toBe(0);
      expect(await storage.head(staleKey)).toBeNull();
      expect(
        await prisma.attachment.count({ where: { id: { in: [fresh.attachment.id, done.id] } } }),
      ).toBe(2);
    });

    it('runs that clean-up on a schedule', async () => {
      const queue = ctx.app.get(QueuesService).queue(QueueName.Maintenance);
      const processor = new AttachmentsProcessor(
        ctx.app.get(QueuesService),
        ctx.app.get(AttachmentsService),
        { get: () => true } as unknown as ConfigService<Env, true>,
      );
      try {
        await processor.onModuleInit();
        await processor.onModuleInit();

        expect(await queue.getJobSchedulersCount()).toBe(1);
        expect((await queue.getJobSchedulers())[0]).toMatchObject({
          key: PURGE_JOB,
          every: 15 * 60 * 1000,
        });
      } finally {
        await queue.removeJobScheduler(PURGE_JOB);
      }
    });
  });
});
