import { Role } from '../generated/prisma/client';
import { hasAtLeast, outranks } from './roles';

// Pure decision functions: the "who may do what" rules live here, away from HTTP and the database,
// so they are easy to read, test and keep in sync with docs/PERMISSIONS.md.

// You can invite someone only to a role below your own (ADMIN invites MANAGER/MEMBER).
export function canInvite(actor: Role, invitedRole: Role): boolean {
  return invitedRole !== Role.OWNER && outranks(actor, invitedRole);
}

// You can change a member's role if you outrank both their current and their new role.
// Nobody changes their own role, and the OWNER role is never assigned or removed this way.
export function canChangeRole(
  actor: Role,
  target: { role: Role; isSelf: boolean },
  newRole: Role,
): boolean {
  return (
    !target.isSelf &&
    newRole !== Role.OWNER &&
    outranks(actor, target.role) &&
    outranks(actor, newRole)
  );
}

// A task can be deleted by whoever created it, or by a MANAGER and above.
export function canDeleteTask(actor: Role, task: { createdById: string }, userId: string): boolean {
  return task.createdById === userId || hasAtLeast(actor, Role.MANAGER);
}

// Anyone can leave (except the OWNER, who must delete the organization instead).
// Removing someone else needs at least ADMIN and a higher rank than theirs.
export function canRemove(actor: Role, target: { role: Role; isSelf: boolean }): boolean {
  if (target.isSelf) {
    return target.role !== Role.OWNER;
  }
  return hasAtLeast(actor, Role.ADMIN) && outranks(actor, target.role);
}
