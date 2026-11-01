import { Injectable, NotFoundException } from '@nestjs/common';
import { decodeCursor, toPage } from '../common/pagination/cursor';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListNotificationsQueryDto } from './dto/notifications.dto';

// Notifications are private: every query is filtered by the signed-in user, on top of the
// organization filter that forTenant adds. Someone else's notification is simply "not found".
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, userId: string, query: ListNotificationsQueryDto) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const afterCursor: Prisma.NotificationWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.value) } },
            { createdAt: new Date(cursor.value), id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.forTenant(organizationId).notification.findMany({
      where: {
        AND: [
          {
            userId,
            // A deleted task's notifications are hidden, like the task itself.
            task: { deletedAt: null },
            ...(query.unreadOnly && { readAt: null }),
          },
          afterCursor,
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        createdAt: true,
        readAt: true,
        commentId: true,
        actor: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, projectId: true } },
      },
    });
    return toPage(rows, query.limit, (row) => ({
      value: row.createdAt.toISOString(),
      id: row.id,
    }));
  }

  async unreadCount(organizationId: string, userId: string) {
    const count = await this.prisma.forTenant(organizationId).notification.count({
      where: { userId, readAt: null, task: { deletedAt: null } },
    });
    return { count };
  }

  async markRead(organizationId: string, userId: string, id: string) {
    const tenant = this.prisma.forTenant(organizationId);
    const found = await tenant.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Notification not found');
    }
    // Only unread ones are touched, so marking twice keeps the first read time.
    await tenant.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(organizationId: string, userId: string) {
    const { count } = await this.prisma.forTenant(organizationId).notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
