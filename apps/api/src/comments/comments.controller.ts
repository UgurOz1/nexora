import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { OrgMembership } from '../common/auth/current-user.decorator';
import { CommentsService } from './comments.service';
import {
  CommentBodyDto,
  CommentPageResponseDto,
  CommentResponseDto,
  ListCommentsQueryDto,
} from './dto/comments.dto';

// Every member can read and write comments; editing follows canEditComment (the author) and
// deleting canDeleteComment (the author, or MANAGER and above).
@ApiTags('comments')
@ApiBearerAuth()
@Controller('organizations/:orgId/tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOkResponse({ type: CommentPageResponseDto })
  list(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.comments.list(actor.organizationId, taskId, query);
  }

  @Post()
  @ApiCreatedResponse({ type: CommentResponseDto })
  create(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.create(actor.organizationId, actor, taskId, dto);
  }

  @Patch(':commentId')
  @ApiOkResponse({ type: CommentResponseDto })
  update(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.update(actor.organizationId, actor, taskId, commentId, dto);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.comments.remove(actor.organizationId, actor, taskId, commentId);
  }
}
