import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { decodeCursor, toPage } from '../common/pagination/cursor';
import { Prisma, TaskStatus } from '../generated/prisma/client';
import { canDeleteTask } from '../organizations/policies';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from './dto/tasks.dto';
import { newPosition } from './task-position';

const userSummary = { select: { id: true, name: true } } as const;

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
  position: true,
  createdAt: true,
  updatedAt: true,
  assignee: userSummary,
  createdBy: userSummary,
  _count: { select: { subtasks: { where: { deletedAt: null } } } },
} as const;

const withSubtasks = {
  ...taskSelect,
  subtasks: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: taskSelect,
  },
} satisfies Prisma.TaskSelect;

function present<T extends { _count: { subtasks: number } }>(task: T) {
  const { _count, ...rest } = task;
  return { ...rest, subtaskCount: _count.subtasks };
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
    const tenant = this.prisma.forTenant(organizationId);
    const project = await tenant.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    await this.assertAssigneeIsMember(organizationId, dto.assigneeId);

    return present(
      await tenant.task.create({
        data: {
          organizationId,
          projectId,
          createdById: actor.userId,
          position: newPosition(),
          ...dto,
        },
        select: taskSelect,
      }),
    );
  }

  // A subtask lives in its parent's project. Only one level: a subtask cannot have subtasks.
  async createSubtask(
    organizationId: string,
    actor: OrgMembership,
    parentId: string,
    dto: CreateTaskDto,
  ) {
    const tenant = this.prisma.forTenant(organizationId);
    const parent = await tenant.task.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { projectId: true, parentId: true },
    });
    if (!parent) {
      throw new NotFoundException('Task not found');
    }
    if (parent.parentId) {
      throw new BadRequestException('Subtasks cannot have subtasks');
    }
    await this.assertAssigneeIsMember(organizationId, dto.assigneeId);

    return present(
      await tenant.task.create({
        data: {
          organizationId,
          projectId: parent.projectId,
          parentId,
          createdById: actor.userId,
          position: newPosition(),
          ...dto,
        },
        select: taskSelect,
      }),
    );
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
      select: withSubtasks,
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const { subtasks, ...rest } = present(task);
    return { ...rest, subtasks: subtasks.map(present) };
  }

  async update(organizationId: string, taskId: string, dto: UpdateTaskDto) {
    await this.assertAssigneeIsMember(organizationId, dto.assigneeId);

    // deletedAt in the where clause: a deleted task cannot be edited (P2025 -> 404).
    const task = await this.prisma.forTenant(organizationId).task.update({
      where: { id: taskId, deletedAt: null },
      data: dto,
      select: taskSelect,
    });
    return present(task);
  }

  // Soft delete, subtasks included, in a single statement.
  async remove(organizationId: string, actor: OrgMembership, taskId: string): Promise<void> {
    const tenant = this.prisma.forTenant(organizationId);
    const task = await tenant.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { createdById: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (!canDeleteTask(actor.role, task, actor.userId)) {
      throw new ForbiddenException('Only the creator or a manager can delete this task');
    }

    await tenant.task.updateMany({
      where: { OR: [{ id: taskId }, { parentId: taskId }], deletedAt: null },
      data: { deletedAt: new Date() },
    });
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
