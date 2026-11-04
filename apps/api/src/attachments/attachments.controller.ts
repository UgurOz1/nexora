import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { OrgMembership } from '../common/auth/current-user.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { AttachmentsService } from './attachments.service';
import {
  AttachmentResponseDto,
  CreateAttachmentDto,
  CreatedAttachmentResponseDto,
  DownloadLinkResponseDto,
} from './dto/attachments.dto';

// Every member can see, add and download attachments of tasks they can see. Removing follows
// canDeleteAttachment: whoever attached the file, or a MANAGER and above.
@ApiTags('attachments')
@ApiBearerAuth()
@Controller('organizations/:orgId')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('tasks/:taskId/attachments')
  @ApiOkResponse({ type: [AttachmentResponseDto] })
  list(@CurrentMembership() actor: OrgMembership, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.attachments.list(actor.organizationId, taskId);
  }

  // Step 1: announce a file. The answer says where and how to upload it.
  @Post('tasks/:taskId/attachments')
  @RateLimit('upload')
  @ApiCreatedResponse({ type: CreatedAttachmentResponseDto })
  create(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateAttachmentDto,
  ) {
    return this.attachments.create(actor.organizationId, actor, taskId, dto);
  }

  // Step 3: say the upload is done; the server checks the file before accepting it.
  @Post('attachments/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Audited({
    action: AuditAction.AttachmentAdded,
    target: { type: 'attachment', param: 'id' },
  })
  @ApiOkResponse({ type: AttachmentResponseDto })
  complete(@CurrentMembership() actor: OrgMembership, @Param('id', ParseUUIDPipe) id: string) {
    return this.attachments.complete(actor.organizationId, actor, id);
  }

  @Get('attachments/:id/download')
  @ApiOkResponse({ type: DownloadLinkResponseDto })
  download(@CurrentMembership() actor: OrgMembership, @Param('id', ParseUUIDPipe) id: string) {
    return this.attachments.download(actor.organizationId, id);
  }

  @Delete('attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({
    action: AuditAction.AttachmentDeleted,
    target: { type: 'attachment', param: 'id' },
  })
  @ApiNoContentResponse()
  remove(
    @CurrentMembership() actor: OrgMembership,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.attachments.remove(actor.organizationId, actor, id);
  }
}
