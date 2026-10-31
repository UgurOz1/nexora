import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { decodeCursor, toPage } from '../common/pagination/cursor';
import { Prisma, TaskEventType, TaskStatus } from '../generated/prisma/client';
import { canDeleteTask } from '../organizations/policies';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantTx } from '../prisma/tenant-scope';
import type { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from './dto/tasks.dto';
import { recordEvent, recordEvents } from './task-events';
import { newPosition } from './task-position';
import { diffSnapshots, snapshotOf } from './task-snapshot';

const userSummary = { select: { id: true, name: true } } as const;
const taskSummary = { select: { id: true, title: true, status: true } } as const;

// "Open" blockers: tasks this one waits for that exist and are not DONE yet.
const openBlockers = { dependsOn: { deletedAt: null, status: { not: TaskStatus.DONE } } } as const;

const taskSelect = {
  id: true,
  projectId: true,
  parentId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  labels: true,
  assigneeId: true,
  position: true,
  recurringTaskId: true,
  createdAt: true,
  updatedAt: true,
  assignee: userSummary,
  createdBy: userSummary,
  _count: {
    select: {
      subtasks: { where: { deletedAt: null } },
      dependencies: { where: openBlockers },
    },
  },
} as const;

const taskDetailSelect = {
  ...taskSelect,
  subtasks: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: taskSelect,
  },
  dependencies: { where: { dependsOn: { deletedAt: null } }, select: { dependsOn: taskSummary } },
  dependents: { where: { task: { deletedAt: null } }, select: { task: taskSummary } },
} satisfies Prisma.TaskSelect;

function present<T extends { _count: { subtasks: number; dependencies: number } }>(task: T) {
  const { _count, ...rest } = task;
  return { ...rest, subtaskCount: _count.subtasks, isBlocked: _count.dependencies > 0 };
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    actor: OrgMembership,
    projectId: string,
    dto: CreateTaskDto,
  ) {
    const project = await this.prisma.forTenant(organizationId).project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.createTask(organizationId, actor, { projectId, ...dto });
  }

  // A subtask lives in its parent's project. Only one level: a subtask cannot have subtasks.
  async createSubtask(
    organizationId: string,
    actor: OrgMembership,
    parentId: string,
    dto: CreateTaskDto,
  ) {
    const parent = await this.prisma.forTenant(organizationId).task.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { projectId: true, parentId: true },
    });
    if (!parent) {
      throw new NotFoundException('Task not found');
    }
    if (parent.parentId) {
      throw new BadRequestException('Subtasks cannot have subtasks');
    }
    return this.createTask(organizationId, actor, {
      projectId: parent.projectId,
      parentId,
      ...dto,
    });
  }

  private async createTask(
    organizationId: string,
    actor: OrgMembership,
    data: CreateTaskDto & { projectId: string; parentId?: string },
  ) {
    await this.assertAssigneeIsMember(organizationId, data.assigneeId);

    // The task and its first history entry are saved together.
    return this.prisma.forTenant(organizationId).$transaction(async (tx) => {
      const task = await tx.task.create({
        data: { organizationId, createdById: actor.userId, position: newPosition(), ...data },
        select: taskSelect,
      });
      const snapshot = snapshotOf(task);
      await recordEvent(tx, {
        organizationId,
        taskId: task.id,
        actorId: actor.userId,
        type: TaskEventType.CREATED,
        changes: diffSnapshots(null, snapshot),
        snapshot,
      });
      return present(task);
    });
  }

  async list(organizationId: string, userId: string, query: ListTasksQueryDto, projectId?: string) {
    const filters: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...(projectId && { projectId }),
      ...(!query.includeSubtasks && { parentId: null }),
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.assigneeId && {
        assigneeId: query.assigneeId === 'me' ? userId : query.assigneeId,
      }),
      ...(query.q && { title: { contains: query.q, mode: 'insensitive' } }),
      ...(query.label && { labels: { has: query.label.toLowerCase() } }),
      ...(query.dueBefore && { dueDate: { lt: query.dueBefore } }),
      ...(query.overdue && { dueDate: { lt: new Date() }, status: { not: TaskStatus.DONE } }),
    };

    // Keyset pagination: "rows after the cursor in the chosen order". With the id as tie-breaker
    // the order is total, so no row is skipped or repeated even if many share a timestamp.
    const op = query.order === 'desc' ? 'lt' : 'gt';
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const afterCursor: Prisma.TaskWhereInput = cursor
      ? {
          OR: [
            { [query.sort]: { [op]: new Date(cursor.value) } },
            { [query.sort]: new Date(cursor.value), id: { [op]: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.forTenant(organizationId).task.findMany({
      where: { AND: [filters, afterCursor] },
      orderBy: [{ [query.sort]: query.order }, { id: query.order }],
      take: query.limit + 1,
      select: taskSelect,
    });

    return toPage(rows.map(present), query.limit, (row) => ({
      value: row[query.sort].toISOString(),
      id: row.id,
    }));
  }

  async get(organizationId: string, taskId: string) {
    const task = await this.prisma.forTenant(organizationId).task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: taskDetailSelect,
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const { subtasks, dependencies, dependents, ...rest } = present(task);
    return {
      ...rest,
      subtasks: subtasks.map(present),
      blockedBy: dependencies.map((d) => d.dependsOn),
      blocks: dependents.map((d) => d.task),
    };
  }

  async update(organizationId: string, actor: OrgMembership, taskId: string, dto: UpdateTaskDto) {
    await this.assertAssigneeIsMember(organizationId, dto.assigneeId);

    return this.prisma.forTenant(organizationId).$transaction(async (tx) => {
      // Lock the row until this transaction ends. Two people editing the same task at the same
      // moment queue up here: the second one reads the result of the first, so every history
      // entry describes exactly one change and nothing is silently overwritten or mislabelled.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM tasks
        WHERE id = ${taskId} AND "organizationId" = ${organizationId} AND "deletedAt" IS NULL
        FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException('Task not found');
      }

      const before = await tx.task.findFirstOrThrow({
        where: { id: taskId, deletedAt: null },
        select: taskSelect,
      });

      // A task that waits for unfinished work cannot move forward. Going back to TODO is always fine.
      if (dto.status && dto.status !== before.status && dto.status !== TaskStatus.TODO) {
        await this.assertNotBlocked(tx, taskId);
      }

      const task = await tx.task.update({
        where: { id: taskId, deletedAt: null },
        data: dto,
        select: taskSelect,
      });

      const snapshot = snapshotOf(task);
      const changes = diffSnapshots(snapshotOf(before), snapshot);
      if (Object.keys(changes).length > 0) {
        await recordEvent(tx, {
          organizationId,
          taskId,
          actorId: actor.userId,
          type: TaskEventType.UPDATED,
          changes,
          snapshot,
        });
      }
      return present(task);
    });
  }

  // Soft delete, subtasks included, with one history entry per deleted task.
  async remove(organizationId: string, actor: OrgMembership, taskId: string): Promise<void> {
    await this.prisma.forTenant(organizationId).$transaction(async (tx) => {
      const rows = await tx.task.findMany({
        where: { OR: [{ id: taskId }, { parentId: taskId }], deletedAt: null },
        select: { ...taskSelect, createdById: true },
      });
      const target = rows.find((row) => row.id === taskId);
      if (!target) {
        throw new NotFoundException('Task not found');
      }
      if (!canDeleteTask(actor.role, target, actor.userId)) {
        throw new ForbiddenException('Only the creator or a manager can delete this task');
      }

      const deletedAt = new Date();
      await tx.task.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, deletedAt: null },
        data: { deletedAt },
      });
      await recordEvents(
        tx,
        rows.map((row) => ({
          organizationId,
          taskId: row.id,
          actorId: actor.userId,
          type: TaskEventType.DELETED,
          changes: { deletedAt: { from: null, to: deletedAt.toISOString() } },
          snapshot: snapshotOf(row),
        })),
      );
    });
  }

  private async assertNotBlocked(tx: TenantTx, taskId: string): Promise<void> {
    const blockers = await tx.taskDependency.findMany({
      where: { taskId, ...openBlockers },
      select: { dependsOn: { select: { title: true } } },
      take: 5,
    });
    if (blockers.length > 0) {
      const titles = blockers.map((b) => `"${b.dependsOn.title}"`).join(', ');
      throw new ConflictException(`This task is blocked by unfinished tasks: ${titles}`);
    }
  }

  // null/undefined means "no assignee", which is always allowed.
  private async assertAssigneeIsMember(organizationId: string, assigneeId?: string | null) {
    if (!assigneeId) {
      return;
    }
    const member = await this.prisma.forTenant(organizationId).membership.findFirst({
      where: { userId: assigneeId },
      select: { userId: true },
    });
    if (!member) {
      throw new BadRequestException('The assignee must be a member of this organization');
    }
  }
}
