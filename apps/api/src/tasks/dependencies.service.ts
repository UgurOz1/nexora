import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { TaskEventType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildGraph, findCycleIfAdded } from './dependency-graph';
import { recordEvent } from './task-events';
import { snapshotOf } from './task-snapshot';

const trackedFields = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  labels: true,
  assigneeId: true,
} as const;

@Injectable()
export class DependenciesService {
  constructor(private readonly prisma: PrismaService) {}

  // "taskId waits for dependsOnId".
  async add(actor: OrgMembership, taskId: string, dependsOnId: string) {
    const { organizationId } = actor;

    return this.prisma.forTenant(organizationId).$transaction(async (tx) => {
      // One writer at a time per organization. Without this, two requests adding "A waits for B"
      // and "B waits for A" at the same moment would each see a graph without the other's edge,
      // both pass the cycle check and together create the very cycle the check exists to prevent.
      // The lock is released automatically when the transaction ends.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;

      const tasks = await tx.task.findMany({
        where: { id: { in: [taskId, dependsOnId] }, deletedAt: null },
        select: trackedFields,
      });
      const task = tasks.find((t) => t.id === taskId);
      const blocker = tasks.find((t) => t.id === dependsOnId);
      if (!task || !blocker) {
        throw new NotFoundException('Task not found');
      }

      const duplicate = await tx.taskDependency.findFirst({ where: { taskId, dependsOnId } });
      if (duplicate) {
        throw new ConflictException('This dependency already exists');
      }

      // Only edges between tasks that still exist count.
      const edges = await tx.taskDependency.findMany({
        where: { task: { deletedAt: null }, dependsOn: { deletedAt: null } },
        select: { taskId: true, dependsOnId: true },
      });
      const cycle = findCycleIfAdded(buildGraph(edges), taskId, dependsOnId);
      if (cycle) {
        throw new BadRequestException(await this.describeCycle(tx, cycle));
      }

      await tx.taskDependency.create({ data: { organizationId, taskId, dependsOnId } });
      await recordEvent(tx, {
        organizationId,
        taskId,
        actorId: actor.userId,
        type: TaskEventType.DEPENDENCY_ADDED,
        changes: { dependsOn: { from: null, to: { id: blocker.id, title: blocker.title } } },
        snapshot: snapshotOf(task),
      });
      return {
        taskId,
        dependsOn: { id: blocker.id, title: blocker.title, status: blocker.status },
      };
    });
  }

  async remove(actor: OrgMembership, taskId: string, dependsOnId: string): Promise<void> {
    const { organizationId } = actor;

    await this.prisma.forTenant(organizationId).$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, deletedAt: null },
        select: trackedFields,
      });
      const { count } = await tx.taskDependency.deleteMany({ where: { taskId, dependsOnId } });
      if (!task || count === 0) {
        throw new NotFoundException('Dependency not found');
      }
      await recordEvent(tx, {
        organizationId,
        taskId,
        actorId: actor.userId,
        type: TaskEventType.DEPENDENCY_REMOVED,
        changes: { dependsOn: { from: { id: dependsOnId }, to: null } },
        snapshot: snapshotOf(task),
      });
    });
  }

  // "Dependency cycle: A -> B -> C -> A", so the user can see which tasks form the loop.
  private async describeCycle(
    tx: Pick<ReturnType<PrismaService['forTenant']>, 'task'>,
    cycle: string[],
  ): Promise<string> {
    const titles = new Map(
      (
        await tx.task.findMany({ where: { id: { in: cycle } }, select: { id: true, title: true } })
      ).map((t) => [t.id, t.title]),
    );
    const names = cycle.map((id) => `"${titles.get(id) ?? id}"`);
    return `This would create a dependency cycle: ${names.join(' -> ')}`;
  }
}
