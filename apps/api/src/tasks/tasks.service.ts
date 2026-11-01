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
import { DomainEvents } from '../events/domain-events';
import { canDeleteTask } from '../organizations/policies';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantTx } from '../prisma/tenant-scope';
import type { CreateTaskDto, ListTasksQueryDto, MoveTaskDto, UpdateTaskDto } from './dto/tasks.dto';
import { recordEvent, recordEvents } from './task-events';
import { endPosition, positionAfter } from './task-ordering';
import { diffSnapshots, snapshotOf } from './task-snapshot';

// A board column shows at most this many tasks; "hasMore" tells the client there are more.
const BOARD_COLUMN_LIMIT = 100;
const BOARD_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.DONE,
] as const;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

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
    const created = await this.prisma.forTenant(organizationId).$transaction(async (tx) => {
      // New tasks go to the bottom of their column.
      const position = await endPosition(tx, {
        projectId: data.projectId,
        status: data.status ?? TaskStatus.TODO,
        parentId: data.parentId ?? null,
      });
      const task = await tx.task.create({
        // The computed values come last: a DTO field that was not sent can be present as `undefined`.
        data: { ...data, organizationId, createdById: actor.userId, position },
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

    await this.events.publish('task.created', {
      organizationId,
      actorId: actor.userId,
      taskId: created.id,
      projectId: created.projectId,
    });
    await this.announceAssignee(organizationId, actor.userId, created.id, null, created.assigneeId);
    return created;
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

    const { before, task: updated } = await this.prisma
      .forTenant(organizationId)
      .$transaction(async (tx) => {
        const before = await this.lockAndLoad(tx, organizationId, taskId);

        // A task that waits for unfinished work cannot move forward. Going back to TODO is always fine.
        const statusChanged = dto.status !== undefined && dto.status !== before.status;
        if (statusChanged && dto.status !== TaskStatus.TODO) {
          await this.assertNotBlocked(tx, taskId);
        }

        const task = await tx.task.update({
          where: { id: taskId, deletedAt: null },
          data: {
            ...dto,
            // Changing the status through the edit form puts the task at the bottom of the new column.
            ...(statusChanged && {
              position: await endPosition(tx, {
                projectId: before.projectId,
                status: dto.status!,
                parentId: before.parentId,
              }),
            }),
          },
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
        return { before, task: present(task) };
      });

    await this.announceChanges(organizationId, actor.userId, before, updated);
    return updated;
  }

  // Everything the Kanban board needs in one request: the top-level tasks of the project, split
  // into one column per status and ordered by their position.
  async board(organizationId: string, projectId: string) {
    const tenant = this.prisma.forTenant(organizationId);
    const project = await tenant.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const columns = await Promise.all(
      BOARD_STATUSES.map(async (status) => {
        const rows = await tenant.task.findMany({
          where: { projectId, status, parentId: null, deletedAt: null },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          take: BOARD_COLUMN_LIMIT + 1,
          select: taskSelect,
        });
        return {
          status,
          tasks: rows.slice(0, BOARD_COLUMN_LIMIT).map(present),
          hasMore: rows.length > BOARD_COLUMN_LIMIT,
        };
      }),
    );
    return { columns };
  }

  // Drag and drop: put the task into a column, right after `afterId` (or at the top). Moving to
  // another column changes the status, so the rules of a status change apply (a task that waits
  // for unfinished work cannot leave TODO) and the change is recorded in the task's history.
  async move(organizationId: string, actor: OrgMembership, taskId: string, dto: MoveTaskDto) {
    if (dto.afterId === taskId) {
      throw new BadRequestException('A task cannot be placed after itself');
    }

    const { before, task: moved } = await this.prisma
      .forTenant(organizationId)
      .$transaction(async (tx) => {
        const before = await this.lockAndLoad(tx, organizationId, taskId);

        const statusChanged = dto.status !== before.status;
        if (statusChanged && dto.status !== TaskStatus.TODO) {
          await this.assertNotBlocked(tx, taskId);
        }

        const position = await positionAfter(
          tx,
          { projectId: before.projectId, status: dto.status, parentId: before.parentId },
          taskId,
          dto.afterId ?? null,
        );
        const task = await tx.task.update({
          where: { id: taskId, deletedAt: null },
          data: { status: dto.status, position },
          select: taskSelect,
        });

        // Reordering inside a column is not part of a task's history; a status change is.
        if (statusChanged) {
          const snapshot = snapshotOf(task);
          await recordEvent(tx, {
            organizationId,
            taskId,
            actorId: actor.userId,
            type: TaskEventType.UPDATED,
            changes: diffSnapshots(snapshotOf(before), snapshot),
            snapshot,
          });
        }
        return { before, task: present(task) };
      });

    await this.announceChanges(organizationId, actor.userId, before, moved);
    return moved;
  }

  // Tells the rest of the system what an edit changed, after the change is committed.
  private async announceChanges(
    organizationId: string,
    actorId: string,
    before: { status: TaskStatus; assigneeId: string | null },
    after: { id: string; projectId: string; status: TaskStatus; assigneeId: string | null },
  ) {
    if (before.status !== after.status) {
      await this.events.publish('task.status_changed', {
        organizationId,
        actorId,
        taskId: after.id,
        projectId: after.projectId,
        from: before.status,
        to: after.status,
      });
    }
    await this.announceAssignee(
      organizationId,
      actorId,
      after.id,
      before.assigneeId,
      after.assigneeId,
    );
  }

  // Assigning a task to yourself is not news to anyone.
  private async announceAssignee(
    organizationId: string,
    actorId: string,
    taskId: string,
    from: string | null,
    to: string | null,
  ) {
    if (to && to !== from && to !== actorId) {
      await this.events.publish('task.assigned', {
        organizationId,
        actorId,
        taskId,
        assigneeId: to,
      });
    }
  }

  // Lock the row until the transaction ends. Two people changing the same task at the same moment
  // queue up here: the second one reads the result of the first, so every history entry describes
  // exactly one change and nothing is silently overwritten or mislabelled.
  private async lockAndLoad(tx: TenantTx, organizationId: string, taskId: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM tasks
      WHERE id = ${taskId} AND "organizationId" = ${organizationId} AND "deletedAt" IS NULL
      FOR UPDATE`;
    if (locked.length === 0) {
      throw new NotFoundException('Task not found');
    }
    return tx.task.findFirstOrThrow({
      where: { id: taskId, deletedAt: null },
      select: taskSelect,
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
