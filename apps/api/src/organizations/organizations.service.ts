import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// "Acme Software!" -> "acme-software"
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'org';
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  // The creator becomes the OWNER in the same write: an organization never exists without one.
  async create(userId: string, name: string) {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      try {
        return await this.prisma.organization.create({
          data: { name, slug, memberships: { create: { userId, role: Role.OWNER } } },
          select: { id: true, name: true, slug: true, createdAt: true },
        });
      } catch (error) {
        const slugTaken =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!slugTaken || attempt === 4) {
          throw error;
        }
      }
    }
    throw new Error('unreachable');
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    return memberships.map(({ role, organization }) => ({ ...organization, role }));
  }

  async get(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const { _count, ...rest } = organization;
    return { ...rest, memberCount: _count.memberships };
  }

  rename(organizationId: string, name: string) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { name },
      select: { id: true, name: true, slug: true },
    });
  }

  async remove(organizationId: string): Promise<void> {
    // Memberships, invitations, projects and tasks go with it (onDelete: Cascade in the schema).
    await this.prisma.organization.delete({ where: { id: organizationId } });
  }
}
