import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { QueueName, QueuesService } from '../queues/queues.service';
import { AttachmentsService } from './attachments.service';

export const PURGE_JOB = 'purge-stale-uploads';
const EVERY_QUARTER_HOUR_MS = 15 * 60 * 1000;

// Uploads that were announced but never confirmed (a closed tab, a lost connection) leave a row
// and possibly a file behind. This job, every 15 minutes, removes the ones older than an hour.
@Injectable()
export class AttachmentsProcessor implements OnModuleInit {
  private readonly logger = new Logger(AttachmentsProcessor.name);

  constructor(
    private readonly queues: QueuesService,
    private readonly attachments: AttachmentsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit() {
    this.queues.registerWorker(
      QueueName.Maintenance,
      async () => {
        const purged = await this.attachments.purgeStaleUploads();
        if (purged > 0) this.logger.log({ purged }, 'Removed unfinished uploads');
        return purged;
      },
      1,
    );

    if (this.config.get('QUEUE_SCHEDULER_ENABLED', { infer: true })) {
      await this.queues
        .queue(QueueName.Maintenance)
        .upsertJobScheduler(
          PURGE_JOB,
          { every: EVERY_QUARTER_HOUR_MS },
          { name: PURGE_JOB, opts: { attempts: 3, removeOnComplete: true } },
        );
    }
  }
}
