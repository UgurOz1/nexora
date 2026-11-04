import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import type { MailMessage } from './mail.service';

// Thin wrapper around SMTP. Locally SMTP goes to Mailpit; in production it will point at a
// real provider. Only the MailProcessor calls it.
@Injectable()
export class MailTransport {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.transport = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
    });
    this.from = config.get('MAIL_FROM', { infer: true });
  }

  async deliver(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
