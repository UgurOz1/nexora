import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { OrgMembership } from '../common/auth/current-user.decorator';
import {
  ListNotificationsQueryDto,
  NotificationPageResponseDto,
  ReadAllResponseDto,
  UnreadCountResponseDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

// Your own notifications in this organization. No role is needed beyond being a member.
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('organizations/:orgId/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationPageResponseDto })
  list(@CurrentMembership() actor: OrgMembership, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(actor.organizationId, actor.userId, query);
  }

  @Get('unread-count')
  @ApiOkResponse({ type: UnreadCountResponseDto })
  unreadCount(@CurrentMembership() actor: OrgMembership) {
    return this.notifications.unreadCount(actor.organizationId, actor.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReadAllResponseDto })
  readAll(@CurrentMembership() actor: OrgMembership) {
    return this.notifications.markAllRead(actor.organizationId, actor.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  read(@CurrentMembership() actor: OrgMembership, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(actor.organizationId, actor.userId, id);
  }
}
