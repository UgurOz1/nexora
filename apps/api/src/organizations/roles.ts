import { SetMetadata } from '@nestjs/common';
import { Role } from '../generated/prisma/client';

// Higher number = more power. Roles form a ladder, so "at least ADMIN" is a simple comparison.
const RANK: Record<Role, number> = {
  [Role.OWNER]: 4,
  [Role.ADMIN]: 3,
  [Role.MANAGER]: 2,
  [Role.MEMBER]: 1,
};

// Roles that can be handed out through invitations or role changes. Ownership is never granted.
export const ASSIGNABLE_ROLES = [Role.ADMIN, Role.MANAGER, Role.MEMBER] as const;

export const hasAtLeast = (actual: Role, minimum: Role): boolean => RANK[actual] >= RANK[minimum];

// Strictly above: nobody can act on someone of equal or higher rank.
export const outranks = (actor: Role, other: Role): boolean => RANK[actor] > RANK[other];

export const MIN_ROLE_KEY = 'minRole';

// Lowest role allowed to call the route. Routes with :orgId default to MEMBER.
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);
