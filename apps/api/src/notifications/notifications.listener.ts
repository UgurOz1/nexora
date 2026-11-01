import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '../generated/prisma/client';
import type { DomainEventMap } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';

// Turns domain events into notification rows. The services that cause the events know nothing
// about notifications.
@Injectable()
export class NotificationsListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('task.assigned')
  async onAssigned(event: DomainEventMap['task.assigned']) {
    await this.prisma.forTenant(event.organizationId).notification.create({
      data: {
        organizationId: event.organizationId,
        userId: event.assigneeId,
        actorId: event.actorId,
        taskId: event.taskId,
        type: NotificationType.ASSIGNED,
      },
    });
  }

  @OnEvent('comment.created')
  @OnEvent('comment.updated')
  async onCommentMentions(
    event: DomainEventMap['comment.created'] | DomainEventMap['comment.updated'],
  ) {
    if (event.mentionedUserIds.length === 0) return;
    await this.prisma.forTenant(event.organizationId).notification.createMany({
      data: event.mentionedUserIds.map((userId) => ({
        organizationId: event.organizationId,
        userId,
        actorId: event.actorId,
        taskId: event.taskId,
        commentId: event.commentId,
        type: NotificationType.MENTION,
      })),
    });
  }
}
