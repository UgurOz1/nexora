import { Injectable } from '@nestjs/common';
import { QueueName, QueuesService } from '../queues/queues.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// What the rest of the app calls to send an email. It does not talk to the mail server: it puts
// the message on the "mail" queue and returns, so a request never waits for SMTP and a mail
// outage cannot fail it. The MailProcessor takes the message from the queue and delivers it, and
// tries again with a growing delay if the mail server is down.
@Injectable()
export class MailService {
  constructor(private readonly queues: QueuesService) {}

  async send(message: MailMessage): Promise<void> {
    await this.queues.queue(QueueName.Mail).add('send', message);
  }
}
