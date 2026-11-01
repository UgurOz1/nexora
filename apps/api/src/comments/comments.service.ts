import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { decodeCursor, toPage } from '../common/pagination/cursor';
import { Prisma, TaskEventType } from '../generated/prisma/client';
import { DomainEvents } from '../events/domain-events';
import { canDeleteComment, canEditComment } from '../organizations/policies';
import { PrismaService } from '../prisma/prisma.service';
import { recordEvent } from '../tasks/task-events';
import { snapshotOf } from '../tasks/task-snapshot';
import type { CommentBodyDto, ListCommentsQueryDto } from './dto/comments.dto';
import { newlyMentioned, parseMentions } from './mentions';

const commentSelect = {
  id: true,
  taskId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // Oldest first, like a conversation. Same keyset pagination as the other lists.
  async list(organizationId: string, taskId: string, query: ListCommentsQueryDto) {
    await this.loadTask(organizationId, taskId);

    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const afterCursor: Prisma.CommentWhereInput = cursor
      ? {
          OR: [
            { createdAt: { gt: new Date(cursor.value) } },
            { createdAt: new Date(cursor.value), id: { gt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.forTenant(organizationId).comment.findMany({
      where: { AND: [{ taskId, deletedAt: null }, afterCursor] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      select: commentSelect,
    });
    return toPage(rows, query.limit, (row) => ({
      value: row.createdAt.toISOString(),
      id: row.id,
    }));
  }

  async create(organizationId: string, actor: OrgMembership, taskId: string, dto: CommentBodyDto) {
    const task = await this.loadTask(organizationId, taskId);
    const mentioned = await this.membersAmong(organizationId, parseMentions(dto.body));

    // The comment and its entry in the task's history are saved together.
    const comment = await this.prisma.forTenant(organizationId).$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { organizationId, taskId, authorId: actor.userId, body: dto.body },
        select: commentSelect,
      });
      await recordEvent(tx, {
        organizationId,
        taskId,
        actorId: actor.userId,
        type: TaskEventType.COMMENT_ADDED,
        changes: { comment: { from: null, to: created.id } },
        snapshot: snapshotOf(task),
      });
      return created;
    });

    await this.events.publish('comment.created', {
      organizationId,
      actorId: actor.userId,
      taskId,
      commentId: comment.id,
      mentionedUserIds: newlyMentioned({
        mentioned,
        alreadyMentioned: [],
        authorId: actor.userId,
      }),
    });
    return comment;
  }

  async update(
    organizationId: string,
    actor: OrgMembership,
    taskId: string,
    commentId: string,
    dto: CommentBodyDto,
  ) {
    const existing = await this.loadComment(organizationId, taskId, commentId);
    if (!canEditComment(existing, actor.userId)) {
      throw new ForbiddenException('Only the author can edit a comment');
    }

    const comment = await this.prisma.forTenant(organizationId).comment.update({
      where: { id: commentId, deletedAt: null },
      data: { body: dto.body, editedAt: new Date() },
      select: commentSelect,
    });

    // Only people who were not mentioned by the old text get a notification.
    const mentioned = await this.membersAmong(organizationId, parseMentions(dto.body));
    await this.events.publish('comment.updated', {
      organizationId,
      actorId: actor.userId,
      taskId,
      commentId,
      mentionedUserIds: newlyMentioned({
        mentioned,
        alreadyMentioned: parseMentions(existing.body),
        authorId: actor.userId,
      }),
    });
    return comment;
  }

  async remove(organizationId: string, actor: OrgMembership, taskId: string, commentId: string) {
    const existing = await this.loadComment(organizationId, taskId, commentId);
    if (!canDeleteComment(actor.role, existing, actor.userId)) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.prisma.forTenant(organizationId).comment.update({
      where: { id: commentId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  private async loadTask(organizationId: string, taskId: string) {
    const task = await this.prisma.forTenant(organizationId).task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        labels: true,
        assigneeId: true,
      },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async loadComment(organizationId: string, taskId: string, commentId: string) {
    const comment = await this.prisma.forTenant(organizationId).comment.findFirst({
      where: { id: commentId, taskId, deletedAt: null },
      select: { authorId: true, body: true },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  // A mention of someone who is not in this organization is just text: it notifies nobody and
  // does not reveal whether that person exists.
  private async membersAmong(organizationId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const memberships = await this.prisma.forTenant(organizationId).membership.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
    });
    const members = new Set(memberships.map((m) => m.userId));
    return userIds.filter((id) => members.has(id));
  }
}
