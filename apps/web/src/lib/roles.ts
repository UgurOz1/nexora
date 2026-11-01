import type { Role } from './api/types';

const RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, MANAGER: 2, MEMBER: 1 };

// Only decides what to SHOW: a MEMBER does not get a "New project" button they could not use.
// It is not security. The API checks the role on every request (see docs/PERMISSIONS.md), so
// hiding a button never replaces that check.
export function hasAtLeast(role: Role | undefined, minimum: Role): boolean {
  return role !== undefined && RANK[role] >= RANK[minimum];
}
