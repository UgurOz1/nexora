import { Injectable, NotFoundException } from '@nestjs/common';
import { decodeCursor, toPage } from '../common/pagination/cursor';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityQueryDto } from './dto/activity.dto';

// The activity feed is the task history of a whole project or organization, newest first: the same
// append-only events that power a single task's history (including "comment added"), read across
// tasks. It is not an audit log: that records security-relevant actions of every kind and comes
// in week 11.
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ActivityQueryDto, projectId?: string) {
    const tenant = this.prisma.forTenant(organizationId);
    if (projectId) {
      const project = await tenant.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const afterCursor: Prisma.TaskEventWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.value) } },
            { createdAt: new Date(cursor.value), id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows = await tenant.taskEvent.findMany({
      where: {
        AND: [{ task: { deletedAt: null, ...(projectId && { projectId }) } }, afterCursor],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        changes: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, projectId: true } },
      },
    });
    return toPage(rows, query.limit, (row) => ({
      value: row.createdAt.toISOString(),
      id: row.id,
    }));
  }
}
