import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job, type JobsOptions, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env';

// One queue per kind of work. A queue is a list in Redis: producers (HTTP requests, event
// listeners) add jobs and return at once, workers take them one by one, in this process or in
// any other process that is connected to the same Redis.
export const QueueName = {
  Mail: 'mail',
  Notifications: 'notifications',
  Recurring: 'recurring',
  // Housekeeping that has no user waiting for it (clearing uploads that were never finished).
  Maintenance: 'maintenance',
  // Jobs that failed every attempt are copied here so they stay visible instead of vanishing.
  DeadLetter: 'dead-letter',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

const DAY_SECONDS = 24 * 60 * 60;

// A failing job is tried again after 1 s, 2 s, 4 s, 8 s (exponential backoff), so a short outage
// of the mail server or the database is absorbed without anyone noticing.
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * DAY_SECONDS },
};

@Injectable()
export class QueuesService implements OnApplicationShutdown {
  private readonly logger = new Logger(QueuesService.name);
  // BullMQ needs maxRetriesPerRequest: null so a blocking wait for a job is never cut short.
  private readonly connection: Redis;
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly prefix: string;

  constructor(config: ConfigService<Env, true>) {
    this.connection = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.prefix = config.get('QUEUE_PREFIX', { infer: true });
  }

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        prefix: this.prefix,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  // Starts taking jobs from `name`. `concurrency` jobs may run at the same time in this process.
  registerWorker(name: QueueName, processor: Processor, concurrency = 5): Worker {
    const worker = new Worker(name, processor, {
      connection: this.connection,
      prefix: this.prefix,
      concurrency,
    });
    worker.on('failed', (job, error) => this.onFailed(name, job, error));
    worker.on('error', (error) => this.logger.error({ err: error }, `Worker "${name}" error`));
    this.workers.push(worker);
    return worker;
  }

  // Resolves when nothing is waiting, running or scheduled for a retry. Used by the tests to
  // wait for the asynchronous work a request set off, instead of sleeping and hoping. The
  // dead-letter queue has no worker on purpose, so what sits there does not count as work.
  async whenIdle(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const busy = await Promise.all(
        [...this.queues.entries()]
          .filter(([name]) => name !== QueueName.DeadLetter)
          .map(async ([, queue]) => {
            const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
            return Object.values(counts).some((count) => count > 0);
          }),
      );
      if (!busy.some(Boolean)) return;
      if (Date.now() > deadline) throw new Error('Queues did not become idle in time');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  // How many jobs each queue holds right now, for the metrics endpoint. A growing "waiting" means
  // the workers do not keep up; a growing dead-letter "waiting" means jobs keep failing for good.
  async jobCounts(): Promise<{ queue: QueueName; state: string; count: number }[]> {
    const states = ['waiting', 'active', 'delayed', 'failed'] as const;
    const perQueue = await Promise.all(
      Object.values(QueueName).map(async (name) => {
        const counts = await this.queue(name).getJobCounts(...states);
        return states.map((state) => ({ queue: name, state, count: counts[state] ?? 0 }));
      }),
    );
    return perQueue.flat();
  }

  private onFailed(name: QueueName, job: Job | undefined, error: Error) {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    this.logger.warn(
      { queue: name, job: job.name, attempt: job.attemptsMade, of: attempts, err: error.message },
      'Job failed',
    );
    // Out of attempts: keep a copy where someone can find it.
    if (job.attemptsMade >= attempts && name !== QueueName.DeadLetter) {
      this.queue(QueueName.DeadLetter)
        .add('dead', {
          queue: name,
          jobName: job.name,
          data: job.data as unknown,
          reason: error.message,
          failedAt: new Date().toISOString(),
        })
        .catch((deadError: unknown) =>
          this.logger.error({ err: deadError }, 'Could not record a dead-letter job'),
        );
    }
  }

  async onApplicationShutdown() {
    // Workers first (they finish the job they are on), then the queues, then the connection.
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.connection.disconnect();
  }
}
