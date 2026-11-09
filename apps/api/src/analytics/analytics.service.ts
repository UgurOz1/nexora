import { Injectable } from '@nestjs/common';
import { Prisma, type Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsCache } from './analytics-cache';
import type {
  AnalyticsOverviewDto,
  AnalyticsRange,
  DailyCountDto,
  DepartmentStatsDto,
  MemberStatsDto,
  ProjectStatsDto,
  TeamStatsDto,
} from './dto/analytics.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;
const MAX_PROJECTS = 50;

// UTC midnight at the start of the first day of a `days`-long range that ends today. Days are
// counted in UTC; the dashboard says so.
export function rangeStart(now: Date, days: number): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
}

// One decimal is plenty for "hours to finish"; null stays null (nothing finished).
export function roundHours(hours: number | null): number | null {
  return hours === null ? null : Math.round(hours * 10) / 10;
}

// Departments are a label on projects, so their numbers are the sums of their projects'.
// Most open work first; projects without a department last.
export function summarizeDepartments(projects: ProjectStatsDto[]): DepartmentStatsDto[] {
  const byName = new Map<string | null, DepartmentStatsDto>();
  for (const p of projects) {
    const entry = byName.get(p.department) ?? {
      department: p.department,
      projects: 0,
      open: 0,
      overdue: 0,
      completed: 0,
    };
    entry.projects += 1;
    entry.open += p.open;
    entry.overdue += p.overdue;
    entry.completed += p.completed;
    byName.set(p.department, entry);
  }
  return [...byName.values()].sort(
    (a, b) =>
      b.open - a.open ||
      Number(a.department === null) - Number(b.department === null) ||
      (a.department ?? '').localeCompare(b.department ?? ''),
  );
}

// Timestamps go to SQL as text cast to `timestamp`: the columns are `timestamp without time zone`
// holding UTC, and this keeps the session's time zone setting out of the comparison.
const ts = (date: Date) => Prisma.sql`${date.toISOString()}::timestamp`;

// The median of (completed - created) in hours, an ordered-set aggregate.
const medianCycleHours = Prisma.sql`percentile_cont(0.5) WITHIN GROUP (
  ORDER BY extract(epoch FROM t."completedAt" - t."createdAt") / 3600)`;

interface Clock {
  now: Date;
  from: Date;
}

// The dashboard's numbers, computed in the database with aggregate queries (no task is loaded
// into the API to be counted).
//
// Every number comes from one of two slices of the organization's tasks, and each slice has an
// index made for it (the analytics_indexes migration, docs/PERFORMANCE.md):
//   * open work  (not DONE)  -> tasks_open_work_idx: status, due date, project, assignee
//   * done work  (DONE)      -> tasks_completed_idx: completion and creation time, project, assignee
// The WHERE clauses below repeat the indexes' conditions word for word ("deletedAt" IS NULL AND
// status <> 'DONE' / "completedAt" IS NOT NULL): Postgres uses a partial index only when it can
// prove the query asks for a subset of its rows. A task is DONE exactly when it has a completion
// time (the database trigger keeps it so).
//
// Raw SQL bypasses the forTenant safety net, so every query filters on organizationId by hand,
// and a test proves one organization never sees another's numbers. Deleting a project deletes its
// tasks in the same transaction, so "t.deletedAt IS NULL" also leaves out deleted projects' tasks.
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCache,
  ) {}

  overview(organizationId: string, days: AnalyticsRange, projectId?: string) {
    return this.cache.getOrCompute(organizationId, 'overview', { days, projectId }, () =>
      this.computeOverview(organizationId, days, projectId, new Date()),
    );
  }

  team(organizationId: string, days: AnalyticsRange) {
    return this.cache.getOrCompute(organizationId, 'team', { days }, () =>
      this.computeTeam(organizationId, days, new Date()),
    );
  }

  async computeOverview(
    organizationId: string,
    days: AnalyticsRange,
    projectId: string | undefined,
    now: Date,
  ): Promise<AnalyticsOverviewDto> {
    const clock = { now, from: rangeStart(now, days) };
    const scope = Prisma.sql`t."organizationId" = ${organizationId} AND t."deletedAt" IS NULL
      ${projectId ? Prisma.sql`AND t."projectId" = ${projectId}` : Prisma.empty}`;

    const [open, done, created, daily, projects] = await Promise.all([
      this.openWork(scope, clock),
      this.doneWork(scope, clock),
      this.createdCount(scope, clock),
      this.daily(scope, clock),
      this.projects(organizationId, projectId, clock),
    ]);
    return {
      range: { days, from: clock.from.toISOString(), generatedAt: now.toISOString() },
      totals: {
        byStatus: {
          TODO: open.todo,
          IN_PROGRESS: open.inProgress,
          IN_REVIEW: open.inReview,
          DONE: done.done,
        },
        overdue: open.overdue,
        dueSoon: open.dueSoon,
        completed: done.completed,
        created,
        medianCycleHours: roundHours(done.medianCycleHours),
      },
      daily,
      projects: projects.slice(0, MAX_PROJECTS),
      departments: summarizeDepartments(projects),
    };
  }

  async computeTeam(
    organizationId: string,
    days: AnalyticsRange,
    now: Date,
  ): Promise<TeamStatsDto> {
    const clock = { now, from: rangeStart(now, days) };
    const [members, unassigned] = await Promise.all([
      this.members(organizationId, clock),
      this.unassigned(organizationId, clock),
    ]);
    return {
      range: { days, from: clock.from.toISOString(), generatedAt: now.toISOString() },
      members,
      unassigned,
    };
  }

  private async openWork(scope: Prisma.Sql, { now }: Clock) {
    const dueSoonUntil = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
    const [row] = await this.prisma.$queryRaw<
      { todo: number; inProgress: number; inReview: number; overdue: number; dueSoon: number }[]
    >`
      SELECT
        count(*) FILTER (WHERE t."status" = 'TODO')::int AS "todo",
        count(*) FILTER (WHERE t."status" = 'IN_PROGRESS')::int AS "inProgress",
        count(*) FILTER (WHERE t."status" = 'IN_REVIEW')::int AS "inReview",
        count(*) FILTER (WHERE t."dueDate" < ${ts(now)})::int AS "overdue",
        count(*) FILTER (WHERE t."dueDate" >= ${ts(now)}
                           AND t."dueDate" < ${ts(dueSoonUntil)})::int AS "dueSoon"
      FROM "tasks" t
      WHERE ${scope} AND t."status" <> 'DONE'`;
    return row;
  }

  private async doneWork(scope: Prisma.Sql, { from }: Clock) {
    const [row] = await this.prisma.$queryRaw<
      { done: number; completed: number; medianCycleHours: number | null }[]
    >`
      SELECT
        count(*)::int AS "done",
        count(*) FILTER (WHERE t."completedAt" >= ${ts(from)})::int AS "completed",
        ${medianCycleHours} FILTER (WHERE t."completedAt" >= ${ts(from)}) AS "medianCycleHours"
      FROM "tasks" t
      WHERE ${scope} AND t."completedAt" IS NOT NULL`;
    return row;
  }

  private async createdCount(scope: Prisma.Sql, { from }: Clock) {
    const [row] = await this.prisma.$queryRaw<{ created: number }[]>`
      SELECT count(*)::int AS "created"
      FROM "tasks" t
      WHERE ${scope} AND t."createdAt" >= ${ts(from)}`;
    return row.created;
  }

  // Every day of the range, also the ones where nothing happened (generate_series + LEFT JOIN),
  // so the chart has no gaps.
  private daily(scope: Prisma.Sql, { now, from }: Clock) {
    return this.prisma.$queryRaw<DailyCountDto[]>`
      WITH days AS (
        SELECT generate_series(${ts(from)}::date, ${ts(now)}::date, interval '1 day')::date AS "day"
      ),
      completed AS (
        SELECT t."completedAt"::date AS "day", count(*)::int AS "n"
        FROM "tasks" t
        WHERE ${scope} AND t."completedAt" IS NOT NULL AND t."completedAt" >= ${ts(from)}
        GROUP BY 1
      ),
      created AS (
        SELECT t."createdAt"::date AS "day", count(*)::int AS "n"
        FROM "tasks" t
        WHERE ${scope} AND t."createdAt" >= ${ts(from)}
        GROUP BY 1
      )
      SELECT to_char(d."day", 'YYYY-MM-DD') AS "date",
             coalesce(c."n", 0) AS "completed",
             coalesce(r."n", 0) AS "created"
      FROM days d
      LEFT JOIN completed c ON c."day" = d."day"
      LEFT JOIN created r ON r."day" = d."day"
      ORDER BY d."day"`;
  }

  // Every project of the organization (the departments are summed from all of them; the list in
  // the response is cut to the first 50). Tasks are grouped per project first and then joined to
  // the few project rows, instead of joining every task row to its project.
  private projects(organizationId: string, projectId: string | undefined, { now, from }: Clock) {
    const tasks = Prisma.sql`t."organizationId" = ${organizationId} AND t."deletedAt" IS NULL
      ${projectId ? Prisma.sql`AND t."projectId" = ${projectId}` : Prisma.empty}`;
    return this.prisma.$queryRaw<ProjectStatsDto[]>`
      WITH open AS (
        SELECT t."projectId", count(*)::int AS "open",
               count(*) FILTER (WHERE t."dueDate" < ${ts(now)})::int AS "overdue"
        FROM "tasks" t
        WHERE ${tasks} AND t."status" <> 'DONE'
        GROUP BY t."projectId"
      ),
      done AS (
        SELECT t."projectId", count(*)::int AS "done",
               count(*) FILTER (WHERE t."completedAt" >= ${ts(from)})::int AS "completed"
        FROM "tasks" t
        WHERE ${tasks} AND t."completedAt" IS NOT NULL
        GROUP BY t."projectId"
      )
      SELECT p."id", p."name", p."department",
             coalesce(o."open", 0) AS "open", coalesce(d."done", 0) AS "done",
             coalesce(o."overdue", 0) AS "overdue", coalesce(d."completed", 0) AS "completed"
      FROM "projects" p
      LEFT JOIN open o ON o."projectId" = p."id"
      LEFT JOIN done d ON d."projectId" = p."id"
      WHERE p."organizationId" = ${organizationId} AND p."deletedAt" IS NULL
        ${projectId ? Prisma.sql`AND p."id" = ${projectId}` : Prisma.empty}
      ORDER BY "open" DESC, p."name", p."id"`;
  }

  // Every current member, also those with nothing assigned (LEFT JOIN), so nobody is missing
  // from the table just because they had no work. Tasks are grouped per assignee before the join,
  // so no sort of all the organization's tasks is needed.
  private async members(organizationId: string, { now, from }: Clock): Promise<MemberStatsDto[]> {
    const tasks = Prisma.sql`t."organizationId" = ${organizationId} AND t."deletedAt" IS NULL`;
    const rows = await this.prisma.$queryRaw<(Omit<MemberStatsDto, 'role'> & { role: Role })[]>`
      WITH open AS (
        SELECT t."assigneeId", count(*)::int AS "open",
               count(*) FILTER (WHERE t."dueDate" < ${ts(now)})::int AS "overdue"
        FROM "tasks" t
        WHERE ${tasks} AND t."status" <> 'DONE'
        GROUP BY t."assigneeId"
      ),
      done AS (
        SELECT t."assigneeId", count(*)::int AS "completed",
               ${medianCycleHours} AS "medianCycleHours"
        FROM "tasks" t
        WHERE ${tasks} AND t."completedAt" IS NOT NULL AND t."completedAt" >= ${ts(from)}
        GROUP BY t."assigneeId"
      )
      SELECT u."id" AS "userId", u."name", m."role",
             coalesce(o."open", 0) AS "open", coalesce(o."overdue", 0) AS "overdue",
             coalesce(d."completed", 0) AS "completed", d."medianCycleHours"
      FROM "memberships" m
      JOIN "users" u ON u."id" = m."userId"
      LEFT JOIN open o ON o."assigneeId" = m."userId"
      LEFT JOIN done d ON d."assigneeId" = m."userId"
      WHERE m."organizationId" = ${organizationId}
      ORDER BY "completed" DESC, "open" DESC, u."name", u."id"`;
    return rows.map((row) => ({ ...row, medianCycleHours: roundHours(row.medianCycleHours) }));
  }

  private async unassigned(organizationId: string, { now }: Clock) {
    const [row] = await this.prisma.$queryRaw<{ open: number; overdue: number }[]>`
      SELECT
        count(*)::int AS "open",
        count(*) FILTER (WHERE t."dueDate" < ${ts(now)})::int AS "overdue"
      FROM "tasks" t
      WHERE t."organizationId" = ${organizationId} AND t."deletedAt" IS NULL
        AND t."status" <> 'DONE'
        AND (t."assigneeId" IS NULL OR NOT EXISTS (
          SELECT 1 FROM "memberships" m
          WHERE m."organizationId" = ${organizationId} AND m."userId" = t."assigneeId"))`;
    return row;
  }
}
