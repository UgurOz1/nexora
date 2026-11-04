import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '../generated/prisma/client';
import type { DomainEventMap } from '../events/domain-events';
import { QueueName, QueuesService } from '../queues/queues.service';
import type { NotificationJob } from './notifications.processor';

// Turns domain events into notification jobs. The services that cause the events know nothing
// about notifications. The row itself is written by the NotificationsProcessor: a failure
// there (the database is briefly unreachable) is retried by the queue instead of being lost.
@Injectable()
export class NotificationsListener {
  constructor(private readonly queues: QueuesService) {}

  @OnEvent('task.assigned')
  async onAssigned(event: DomainEventMap['task.assigned']) {
    await this.enqueue({
      organizationId: event.organizationId,
      items: [
        {
          userId: event.assigneeId,
          actorId: event.actorId,
          taskId: event.taskId,
          type: NotificationType.ASSIGNED,
        },
      ],
    });
  }

  @OnEvent('comment.created')
  @OnEvent('comment.updated')
  async onCommentMentions(
    event: DomainEventMap['comment.created'] | DomainEventMap['comment.updated'],
  ) {
    if (event.mentionedUserIds.length === 0) return;
    await this.enqueue({
      organizationId: event.organizationId,
      items: event.mentionedUserIds.map((userId) => ({
        userId,
        actorId: event.actorId,
        taskId: event.taskId,
        commentId: event.commentId,
        type: NotificationType.MENTION,
      })),
    });
  }

  private async enqueue(job: NotificationJob) {
    await this.queues.queue(QueueName.Notifications).add('create', job);
  }
}
