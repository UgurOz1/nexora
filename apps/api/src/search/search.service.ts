import { Injectable } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchQueryDto } from './dto/search.dto';
import { buildTsQuery } from './tsquery';

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  projectName: string;
  parentId: string | null;
}
export interface ProjectRow {
  id: string;
  name: string;
  department: string | null;
}

// Full-text search over tasks and projects with the vectors and GIN indexes of the
// full_text_search migration.
//
// This is the one place that writes SQL by hand, and raw SQL bypasses the forTenant safety net
// (that guards Prisma's model methods only). So the organization filter is written out in every
// query below, and a test proves a company never finds another's rows.
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(organizationId: string, query: SearchQueryDto) {
    const tsQuery = buildTsQuery(query.q);
    if (!tsQuery) {
      return { tasks: [], projects: [] };
    }
    const [tasks, projects] = await Promise.all([
      this.tasks(organizationId, tsQuery, query.limit, query.projectId),
      // Searching inside one project looks for its tasks only.
      query.projectId ? Promise.resolve([]) : this.projects(organizationId, tsQuery, query.limit),
    ]);
    return { tasks, projects };
  }

  // Best match first (ts_rank_cd counts how close together the matching words are, and a hit in
  // the title weighs more than one in the description), ties broken by what changed last.
  private tasks(organizationId: string, tsQuery: string, limit: number, projectId?: string) {
    return this.prisma.$queryRaw<TaskRow[]>`
      SELECT t."id", t."title", t."status", t."priority", t."projectId", t."parentId",
             p."name" AS "projectName"
      FROM "tasks" t
      JOIN "projects" p ON p."id" = t."projectId"
      WHERE t."organizationId" = ${organizationId}
        AND t."deletedAt" IS NULL
        AND p."deletedAt" IS NULL
        AND t."searchVector" @@ to_tsquery('simple', ${tsQuery})
        ${projectId ? Prisma.sql`AND t."projectId" = ${projectId}` : Prisma.empty}
      ORDER BY ts_rank_cd(t."searchVector", to_tsquery('simple', ${tsQuery})) DESC,
               t."updatedAt" DESC
      LIMIT ${limit}`;
  }

  private projects(organizationId: string, tsQuery: string, limit: number) {
    return this.prisma.$queryRaw<ProjectRow[]>`
      SELECT p."id", p."name", p."department"
      FROM "projects" p
      WHERE p."organizationId" = ${organizationId}
        AND p."deletedAt" IS NULL
        AND p."searchVector" @@ to_tsquery('simple', ${tsQuery})
      ORDER BY ts_rank_cd(p."searchVector", to_tsquery('simple', ${tsQuery})) DESC,
               p."updatedAt" DESC
      LIMIT ${limit}`;
  }
}
