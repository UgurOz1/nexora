import { Injectable, OnModuleInit } from '@nestjs/common';
import type { NotificationType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueName, QueuesService } from '../queues/queues.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface NotificationJob {
  organizationId: string;
  items: {
    userId: string;
    actorId: string;
    taskId: string;
    commentId?: string;
    type: NotificationType;
  }[];
}

// Writes the notifications of a "create" job, then tells the recipients' open browser tabs.
// The write is one INSERT, so a job is either fully stored or not at all, and a retry after a
// failure cannot leave half of it behind. (Delivery is "at least once": if the worker dies
// right after the INSERT but before the queue hears about it, the job runs again.)
@Injectable()
export class NotificationsProcessor implements OnModuleInit {
  constructor(
    private readonly queues: QueuesService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit() {
    this.queues.registerWorker(QueueName.Notifications, (job) =>
      this.create(job.data as NotificationJob),
    );
  }

  async create({ organizationId, items }: NotificationJob): Promise<void> {
    await this.prisma.forTenant(organizationId).notification.createMany({
      data: items.map((item) => ({ ...item, organizationId })),
    });
    // The payload says only "you have something new"; the bell asks the API for the details.
    for (const userId of new Set(items.map((item) => item.userId))) {
      this.realtime.toUser(userId, 'notifications.changed', { organizationId });
    }
  }
}
