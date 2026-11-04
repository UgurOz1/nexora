import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsProcessor } from './attachments.processor';
import { AttachmentsService } from './attachments.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsProcessor],
})
export class AttachmentsModule {}
