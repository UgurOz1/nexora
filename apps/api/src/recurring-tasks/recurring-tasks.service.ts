import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { Prisma, TaskEventType, TaskStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { recordEvent } from '../tasks/task-events';
import { endPosition } from '../tasks/task-ordering';
import { diffSnapshots, snapshotOf } from '../tasks/task-snapshot';
import type { CreateRecurringTaskDto, UpdateRecurringTaskDto } from './dto/recurring-tasks.dto';
import {
  firstOccurrenceFrom,
  InvalidRecurrenceError,
  occurrenceAfter,
  parseRule,
  upcomingOccurrences,
} from './recurrence';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
const PREVIEW_COUNT = 5;

const templateSelect = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  priority: true,
  labels: true,
  assigneeId: true,
  rrule: true,
  startsAt: true,
  dueInDays: true,
  active: true,
  nextRunAt: true,
  lastRunAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Template = Prisma.RecurringTaskGetPayload<{ select: typeof templateSelect }>;

@Injectable()
export class RecurringTasksService {
  private readonly logger = new Logger(RecurringTasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(actor: OrgMembership, dto: CreateRecurringTaskDto) {
    const { organizationId } = actor;
    const tenant = this.prisma.forTenant(organizationId);

    const project = await tenant.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    await this.assertAssigneeIsMember(organizationId, dto.assigneeId);

    const startsAt = dto.startsAt ?? new Date();
    const rule = this.rule(dto.rrule, startsAt);
    // The first occurrence still ahead of us; occurrences in the past are never back-filled.
    const nextRunAt = firstOccurrenceFrom(rule, new Date());
    if (!nextRunAt) {
      throw new BadRequestException('The recurrence rule has no upcoming occurrences');
    }

    const created = await tenant.recurringTask.create({
      // The computed values come last: a DTO field that was not sent can still be present as
      // `undefined`, and a later spread would overwrite the real value with it.
      data: { ...dto, organizationId, createdById: actor.userId, startsAt, nextRunAt },
      select: templateSelect,
    });
    return present(created);
  }

  async list(organizationId: string) {
    const rows = await this.prisma.forTenant(organizationId).recurringTask.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: templateSelect,
    });
    return rows.map(present);
  }

  async get(organizationId: string, id: string) {
    return present(await this.find(organizationId, id));
  }

  async update(organizationId: string, id: string, dto: UpdateRecurringTaskDto) {
    const existing = await this.find(organizationId, id);
    await this.assertAssigneeIsMember(organizationId, dto.assigneeId);

    const scheduleChanged =
      dto.rrule !== undefined || dto.startsAt !== undefined || dto.active === true;
    let nextRunAt: Date | null | undefined;
    if (scheduleChanged) {
      const rule = this.rule(dto.rrule ?? existing.rrule, dto.startsAt ?? existing.startsAt);
      nextRunAt = firstOccurrenceFrom(rule, new Date());
      if (!nextRunAt && (dto.active ?? existing.active)) {
        throw new BadRequestException('The recurrence rule has no upcoming occurrences');
      }
    }

    const updated = await this.prisma.forTenant(organizationId).recurringTask.update({
      where: { id },
      data: { ...dto, ...(nextRunAt !== undefined && { nextRunAt }) },
      select: templateSelect,
    });
    return present(updated);
  }

  // Tasks that were already generated stay; only the template goes away.
  async remove(organizationId: string, id: string): Promise<void> {
    const { count } = await this.prisma
      .forTenant(organizationId)
      .recurringTask.deleteMany({ where: { id } });
    if (count === 0) {
      throw new NotFoundException('Recurring task not found');
    }
  }

  // Creates the tasks that are due. Meant to be called by a scheduled job (week 10); it takes
  // `now` as a parameter so tests can move time. It is the one place that reads templates across
  // all organizations on purpose: a system job serves every tenant. Each template is then
  // handled with a client scoped to its own organization.
  //
  // Misfire policy: if the job was down and several occurrences were missed, only ONE task is
  // created and the schedule continues from the next occurrence after `now`. Catching up on
  // dozens of stale tasks would only flood people.
  async generateDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.recurringTask.findMany({
      where: { active: true, nextRunAt: { lte: now }, project: { deletedAt: null } },
      orderBy: { nextRunAt: 'asc' },
      take: BATCH_SIZE,
      select: { ...templateSelect, organizationId: true, createdById: true },
    });

    let created = 0;
    for (const template of due) {
      if (await this.generateOne(template, now)) {
        created++;
      }
    }
    return created;
  }

  private async generateOne(
    template: Template & { organizationId: string; createdById: string },
    now: Date,
  ): Promise<boolean> {
    const { organizationId } = template;
    const occurrence = template.nextRunAt!;
    const next = occurrenceAfter(this.rule(template.rrule, template.startsAt), now);

    try {
      return await this.prisma.forTenant(organizationId).$transaction(async (tx) => {
        // Claim the occurrence: only the run that moves nextRunAt away from `occurrence` goes on.
        // If two workers pick up the same template, one of them gets count 0 and stops here.
        const claimed = await tx.recurringTask.updateMany({
          where: { id: template.id, active: true, nextRunAt: occurrence },
          data: { nextRunAt: next, lastRunAt: now },
        });
        if (claimed.count === 0) {
          return false;
        }

        // The assignee may have left the organization since the template was written.
        const assignee = template.assigneeId
          ? await tx.membership.findFirst({
              where: { userId: template.assigneeId },
              select: { userId: true },
            })
          : null;

        const task = await tx.task.create({
          data: {
            organizationId,
            projectId: template.projectId,
            createdById: template.createdById,
            assigneeId: assignee?.userId ?? null,
            title: template.title,
            description: template.description,
            priority: template.priority,
            labels: template.labels,
            dueDate:
              template.dueInDays === null
                ? null
                : new Date(occurrence.getTime() + template.dueInDays * DAY_MS),
            position: await endPosition(tx, {
              projectId: template.projectId,
              status: TaskStatus.TODO,
              parentId: null,
            }),
            // Together these make the occurrence unique in the database itself.
            recurringTaskId: template.id,
            occurrenceAt: occurrence,
          },
        });
        const snapshot = snapshotOf(task);
        await recordEvent(tx, {
          organizationId,
          taskId: task.id,
          actorId: null,
          type: TaskEventType.CREATED,
          changes: diffSnapshots(null, snapshot),
          snapshot,
        });
        return true;
      });
    } catch (error) {
      // The unique (recurringTaskId, occurrenceAt) pair says this occurrence already has its task.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      // One broken template must not stop the others.
      this.logger.error({ err: error, recurringTaskId: template.id }, 'Failed to generate task');
      return false;
    }
  }

  private async find(organizationId: string, id: string) {
    const template = await this.prisma.forTenant(organizationId).recurringTask.findFirst({
      where: { id },
      select: templateSelect,
    });
    if (!template) {
      throw new NotFoundException('Recurring task not found');
    }
    return template;
  }

  private rule(rrule: string, startsAt: Date) {
    try {
      return parseRule(rrule, startsAt);
    } catch (error) {
      if (error instanceof InvalidRecurrenceError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

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

// What a template looks like to API clients, plus a preview of when it will fire next.
function present(template: Template) {
  const upcoming = template.active
    ? upcomingOccurrences(parseRule(template.rrule, template.startsAt), new Date(), PREVIEW_COUNT)
    : [];
  return { ...template, upcoming };
}
