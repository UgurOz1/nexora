import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canChangeRole, canRemove } from './policies';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.forTenant(organizationId).membership.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async changeRole(actor: OrgMembership, targetUserId: string, newRole: Role) {
    const tenant = this.prisma.forTenant(actor.organizationId);
    const target = await this.findMember(actor.organizationId, targetUserId);

    const allowed = canChangeRole(
      actor.role,
      { role: target.role, isSelf: target.userId === actor.userId },
      newRole,
    );
    if (!allowed) {
      throw new ForbiddenException('You cannot change this member to that role');
    }

    return tenant.membership.update({
      where: {
        userId_organizationId: { userId: targetUserId, organizationId: actor.organizationId },
      },
      data: { role: newRole },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
    });
  }

  async remove(actor: OrgMembership, targetUserId: string): Promise<void> {
    const target = await this.findMember(actor.organizationId, targetUserId);

    const allowed = canRemove(actor.role, {
      role: target.role,
      isSelf: target.userId === actor.userId,
    });
    if (!allowed) {
      throw new ForbiddenException(
        target.role === Role.OWNER && target.userId === actor.userId
          ? 'The owner cannot leave; delete the organization instead'
          : 'You cannot remove this member',
      );
    }

    await this.prisma.forTenant(actor.organizationId).membership.deleteMany({
      where: { userId: targetUserId },
    });
  }

  private async findMember(organizationId: string, userId: string) {
    const member = await this.prisma.forTenant(organizationId).membership.findFirst({
      where: { userId },
      select: { userId: true, role: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }
}
