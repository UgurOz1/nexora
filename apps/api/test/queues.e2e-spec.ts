import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { Env } from '../src/config/env';
import { MailService, type MailMessage } from '../src/mail/mail.service';
import { MailTransport } from '../src/mail/mail.transport';
import { NotificationsProcessor } from '../src/notifications/notifications.processor';
import { QueueName, QueuesService } from '../src/queues/queues.service';
import { RecurringTasksProcessor } from '../src/recurring-tasks/recurring-tasks.processor';
import { RecurringTasksService } from '../src/recurring-tasks/recurring-tasks.service';
import { apiFor, createTestApp, PASSWORD, type TestContext } from './helpers';

// The real queue path: Redis, BullMQ and the workers. (The other e2e files replace the mail
// service with a fake that records messages, so they never touch the mail queue.)
describe('background jobs (e2e)', () => {
  describe('mail queue', () => {
    let app: INestApplication;
    let queues: QueuesService;
    const delivered: MailMessage[] = [];
    let failures = 0;
    const transport = {
      deliver: jest.fn((message: MailMessage) => {
        if (failures > 0) {
          failures--;
          return Promise.reject(new Error('SMTP server is down'));
        }
        delivered.push(message);
        return Promise.resolve();
      }),
    };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MailTransport)
        .useValue(transport)
        .compile();
      app = moduleRef.createNestApplication();
      configureApp(app);
      await app.init();
      queues = app.get(QueuesService);
    });

    beforeEach(() => {
      delivered.length = 0;
      failures = 0;
      transport.deliver.mockClear();
    });

    afterAll(async () => {
      await app.close();
    });

    const message = (to: string): MailMessage => ({
      to,
      subject: 'Hello',
      text: 'Hi there',
      html: '<p>Hi there</p>',
    });

    it('delivers a message from the queue, not from the request', async () => {
      await app.get(MailService).send(message('a@example.com'));
      await queues.whenIdle();

      expect(delivered).toEqual([message('a@example.com')]);
    });

    it('tries again with a delay when the mail server is down, and then delivers', async () => {
      failures = 2; // attempts 1 and 2 fail; the third (after 1 s and 2 s of backoff) works

      await app.get(MailService).send(message('b@example.com'));
      await queues.whenIdle();

      expect(transport.deliver).toHaveBeenCalledTimes(3);
      expect(delivered.map((m) => m.to)).toEqual(['b@example.com']);
    });

    it('keeps a job that failed every attempt in the dead-letter queue', async () => {
      failures = 99;
      // Two quick attempts instead of five slow ones.
      await queues.queue(QueueName.Mail).add('send', message('c@example.com'), {
        attempts: 2,
        backoff: { type: 'fixed', delay: 20 },
      });
      await queues.whenIdle();

      expect(transport.deliver).toHaveBeenCalledTimes(2);
      expect(delivered).toEqual([]);
      const dead = await queues.queue(QueueName.DeadLetter).getJobs(['waiting']);
      const mine = dead.filter(
        (job) => (job.data as { data: MailMessage }).data.to === 'c@example.com',
      );
      expect(mine).toHaveLength(1);
      expect(mine[0].data).toMatchObject({
        queue: 'mail',
        jobName: 'send',
        reason: 'SMTP server is down',
      });
    });

    it('lets a request finish before the email is sent', async () => {
      failures = 1; // the first delivery attempt fails, but the request has long been answered
      const email = `queued.${Date.now()}@example.com`;

      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, name: 'Queued' })
        .expect(201);
      await queues.whenIdle();

      const mail = delivered.find((m) => m.to === email);
      expect(mail?.subject).toContain('Confirm');
    });
  });

  describe('notification queue', () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestApp();
    });

    afterAll(async () => {
      await ctx.app.close();
    });

    it('retries a failed write instead of losing the notification', async () => {
      const api = apiFor(ctx);
      const [ada, mia] = await Promise.all([ctx.signUp('ada'), ctx.signUp('mia')]);
      const org = await api.createOrg(ada, 'Retry Co');
      await api.join(ada, org, mia, 'MEMBER');
      const project = (
        await api.post(ada, `/organizations/${org.id}/projects`, { name: 'P' }).expect(201)
      ).body as { id: string };
      const task = (
        await api
          .post(ada, `/organizations/${org.id}/projects/${project.id}/tasks`, { title: 'T' })
          .expect(201)
      ).body as { id: string };

      // The database "hiccups" once while the worker writes the notification.
      const processor = ctx.app.get(NotificationsProcessor);
      const spy = jest
        .spyOn(processor, 'create')
        .mockRejectedValueOnce(new Error('connection reset'));

      await api
        .post(ada, `/organizations/${org.id}/tasks/${task.id}/comments`, {
          body: `Hello @[mia](${mia.id})`,
        })
        .expect(201);
      await ctx.settle();

      expect(spy).toHaveBeenCalledTimes(2); // failed once, retried once
      const unread = await api.get(mia, `/organizations/${org.id}/notifications/unread-count`);
      expect((unread.body as { count: number }).count).toBe(1);
      spy.mockRestore();
    });
  });

  describe('recurring-task schedule', () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestApp();
    });

    afterAll(async () => {
      await ctx.app.close();
    });

    // The e2e app starts with the scheduler switched off (see setup-env.ts), so the processor is
    // started by hand here, the way each API server does when it boots.
    const bootServer = () =>
      new RecurringTasksProcessor(ctx.app.get(QueuesService), ctx.app.get(RecurringTasksService), {
        get: () => true,
      } as unknown as ConfigService<Env, true>).onModuleInit();

    it('registers one repeating job that runs every minute, however often a server starts', async () => {
      const queue = ctx.app.get(QueuesService).queue(QueueName.Recurring);
      try {
        await bootServer();
        await bootServer(); // a second server, or a redeploy, updates the same scheduler

        expect(await queue.getJobSchedulersCount()).toBe(1);
        const [scheduler] = await queue.getJobSchedulers();
        expect(scheduler).toMatchObject({ key: 'generate-due', every: 60_000 });
      } finally {
        await queue.removeJobScheduler('generate-due');
      }
    });

    it('generates due tasks when the job runs', async () => {
      const generate = jest
        .spyOn(ctx.app.get(RecurringTasksService), 'generateDue')
        .mockResolvedValue(0);

      await ctx.app.get(QueuesService).queue(QueueName.Recurring).add('generate-due', {});
      await ctx.settle();

      expect(generate).toHaveBeenCalled();
      generate.mockRestore();
    });
  });
});
