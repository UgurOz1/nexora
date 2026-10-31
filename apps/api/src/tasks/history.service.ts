import { Injectable, NotFoundException } from '@nestjs/common';
import { decodeCursor, toPage } from '../common/pagination/cursor';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { HistoryQueryDto } from './dto/dependencies.dto';
import { diffSnapshots, type TaskSnapshot } from './task-snapshot';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Newest first, with the same cursor pagination as the task list.
  async list(organizationId: string, taskId: string, query: HistoryQueryDto) {
    const tenant = this.prisma.forTenant(organizationId);
    await this.assertTaskExists(organizationId, taskId);

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
      where: { AND: [{ taskId }, afterCursor] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        changes: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
    });
    return toPage(rows, query.limit, (row) => ({
      value: row.createdAt.toISOString(),
      id: row.id,
    }));
  }

  // What changed between two versions of the task, however far apart they are.
  async compare(organizationId: string, taskId: string, fromId: string, toId: string) {
    await this.assertTaskExists(organizationId, taskId);

    const events = await this.prisma.forTenant(organizationId).taskEvent.findMany({
      where: { taskId, id: { in: [fromId, toId] } },
      select: { id: true, createdAt: true, snapshot: true },
    });
    const from = events.find((e) => e.id === fromId);
    const to = events.find((e) => e.id === toId);
    if (!from || !to) {
      throw new NotFoundException('History entry not found');
    }

    return {
      from: { id: from.id, at: from.createdAt },
      to: { id: to.id, at: to.createdAt },
      // We wrote these snapshots ourselves, in exactly this shape (see recordEvent).
      changes: diffSnapshots(
        from.snapshot as unknown as TaskSnapshot,
        to.snapshot as unknown as TaskSnapshot,
      ),
    };
  }

  private async assertTaskExists(organizationId: string, taskId: string) {
    const task = await this.prisma.forTenant(organizationId).task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }
}
