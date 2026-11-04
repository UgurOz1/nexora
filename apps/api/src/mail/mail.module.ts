import { Module } from '@nestjs/common';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { MailTransport } from './mail.transport';

@Module({
  providers: [MailService, MailTransport, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
