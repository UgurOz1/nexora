import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../common/auth/current-user.decorator';
import { IS_PUBLIC_KEY } from '../common/auth/public.decorator';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasAtLeast, MIN_ROLE_KEY } from './roles';

// Registered globally and only active on routes that contain :orgId. Any future route under
// /organizations/:orgId/... is therefore tenant-checked automatically; it cannot be forgotten.
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.params.orgId;
    if (typeof organizationId !== 'string') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || !request.user) {
      // A route with :orgId must never be public; fail closed if someone marks it so.
      throw new UnauthorizedException('Authentication required');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: request.user.id, organizationId } },
      select: { userId: true, organizationId: true, role: true },
    });
    // 404, not 403: do not reveal that an organization exists to people outside it.
    if (!membership) {
      throw new NotFoundException('Organization not found');
    }

    const minimum =
      this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? Role.MEMBER;
    if (!hasAtLeast(membership.role, minimum)) {
      throw new ForbiddenException('Your role does not allow this action');
    }

    request.membership = membership;
    return true;
  }
}
