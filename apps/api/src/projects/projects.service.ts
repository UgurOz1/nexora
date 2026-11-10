import { Injectable, NotFoundException } from '@nestjs/common';
import { DomainEvents } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

const projectSelect = {
  id: true,
  name: true,
  description: true,
  department: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  // Adds taskCount (tasks that are not deleted) with one query limited to these projects. Not
  // Prisma's _count: that groups every task in the table (see tasks/task-counts.ts).
  private async withTaskCounts<T extends { id: string }>(organizationId: string, projects: T[]) {
    if (projects.length === 0) return [];
    const counts = await this.prisma.forTenant(organizationId).task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projects.map((p) => p.id) }, deletedAt: null },
      _count: { _all: true },
    });
    const byProject = new Map(counts.map((row) => [row.projectId, row._count._all]));
    return projects.map((project) => ({ ...project, taskCount: byProject.get(project.id) ?? 0 }));
  }

  private async withTaskCount<T extends { id: string }>(organizationId: string, project: T) {
    const [counted] = await this.withTaskCounts(organizationId, [project]);
    return counted;
  }

  async create(organizationId: string, dto: CreateProjectDto) {
    const project = await this.prisma.forTenant(organizationId).project.create({
      data: { organizationId, ...dto },
      select: projectSelect,
    });
    return this.withTaskCount(organizationId, project);
  }

  async list(organizationId: string) {
    const projects = await this.prisma.forTenant(organizationId).project.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: projectSelect,
    });
    return this.withTaskCounts(organizationId, projects);
  }

  async get(organizationId: string, projectId: string) {
    const project = await this.prisma.forTenant(organizationId).project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: projectSelect,
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.withTaskCount(organizationId, project);
  }

  async update(organizationId: string, projectId: string, dto: UpdateProjectDto) {
    // deletedAt in the where clause: a deleted project cannot be edited (P2025 -> 404).
    const project = await this.prisma.forTenant(organizationId).project.update({
      where: { id: projectId, deletedAt: null },
      data: dto,
      select: projectSelect,
    });
    await this.events.publish('project.changed', { organizationId, projectId });
    return this.withTaskCount(organizationId, project);
  }

  // Soft delete: rows stay in the database (recoverable, auditable) but disappear from the API.
  // The project's tasks are hidden with it, in one transaction so they cannot get out of step.
  async remove(organizationId: string, projectId: string): Promise<void> {
    const tenant = this.prisma.forTenant(organizationId);
    await this.get(organizationId, projectId);

    const deletedAt = new Date();
    await tenant.$transaction([
      tenant.project.updateMany({ where: { id: projectId, deletedAt: null }, data: { deletedAt } }),
      tenant.task.updateMany({ where: { projectId, deletedAt: null }, data: { deletedAt } }),
    ]);
    await this.events.publish('project.changed', { organizationId, projectId });
  }
}
