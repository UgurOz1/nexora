import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client';

export interface AuthUser {
  id: string;
}

// The caller's membership in the organization named by :orgId, set by OrganizationGuard.
export interface OrgMembership {
  userId: string;
  organizationId: string;
  role: Role;
}

export type AuthenticatedRequest = Request & { user?: AuthUser; membership?: OrgMembership };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
