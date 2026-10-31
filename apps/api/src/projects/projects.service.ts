import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

const projectSelect = {
  id: true,
  name: true,
  description: true,
  department: true,
  createdAt: true,
  updatedAt: true,
  // Only tasks that are not soft-deleted count.
  _count: { select: { tasks: { where: { deletedAt: null } } } },
} as const;

function present<T extends { _count: { tasks: number } }>(project: T) {
  const { _count, ...rest } = project;
  return { ...rest, taskCount: _count.tasks };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateProjectDto) {
    const project = await this.prisma.forTenant(organizationId).project.create({
      data: { organizationId, ...dto },
      select: projectSelect,
    });
    return present(project);
  }

  async list(organizationId: string) {
    const projects = await this.prisma.forTenant(organizationId).project.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: projectSelect,
    });
    return projects.map(present);
  }

  async get(organizationId: string, projectId: string) {
    const project = await this.prisma.forTenant(organizationId).project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: projectSelect,
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return present(project);
  }

  async update(organizationId: string, projectId: string, dto: UpdateProjectDto) {
    // deletedAt in the where clause: a deleted project cannot be edited (P2025 -> 404).
    const project = await this.prisma.forTenant(organizationId).project.update({
      where: { id: projectId, deletedAt: null },
      data: dto,
      select: projectSelect,
    });
    return present(project);
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
  }
}
