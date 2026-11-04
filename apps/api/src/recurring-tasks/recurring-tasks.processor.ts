import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { QueueName, QueuesService } from '../queues/queues.service';
import { RecurringTasksService } from './recurring-tasks.service';

export const GENERATE_DUE_JOB = 'generate-due';
const EVERY_MINUTE_MS = 60_000;

// Runs RecurringTasksService.generateDue() on a schedule. BullMQ stores the schedule in Redis
// (a "job scheduler"), so starting ten API servers still produces ONE job per minute, not ten.
// And if two workers ever did run it at once, the claim logic inside generateDue keeps every
// occurrence from becoming two tasks (see ADR-0005).
@Injectable()
export class RecurringTasksProcessor implements OnModuleInit {
  private readonly logger = new Logger(RecurringTasksProcessor.name);

  constructor(
    private readonly queues: QueuesService,
    private readonly recurring: RecurringTasksService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit() {
    this.queues.registerWorker(
      QueueName.Recurring,
      async () => {
        const created = await this.recurring.generateDue();
        if (created > 0) this.logger.log({ created }, 'Generated recurring tasks');
        return created;
      },
      1,
    );

    if (this.config.get('QUEUE_SCHEDULER_ENABLED', { infer: true })) {
      // Upsert: running it again (every deploy, every server) updates the same scheduler.
      await this.queues
        .queue(QueueName.Recurring)
        .upsertJobScheduler(
          GENERATE_DUE_JOB,
          { every: EVERY_MINUTE_MS },
          { name: GENERATE_DUE_JOB, opts: { attempts: 3, removeOnComplete: true } },
        );
    }
  }
}
