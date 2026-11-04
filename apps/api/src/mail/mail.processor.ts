import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueName, QueuesService } from '../queues/queues.service';
import { MailTransport } from './mail.transport';
import type { MailMessage } from './mail.service';

// Takes "send" jobs from the mail queue and delivers them. If the mail server refuses or is
// unreachable the job throws, and the queue schedules another attempt (see DEFAULT_JOB_OPTIONS).
@Injectable()
export class MailProcessor implements OnModuleInit {
  constructor(
    private readonly queues: QueuesService,
    private readonly transport: MailTransport,
  ) {}

  onModuleInit() {
    this.queues.registerWorker(QueueName.Mail, (job) =>
      this.transport.deliver(job.data as MailMessage),
    );
  }
}
