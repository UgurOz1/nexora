import { Role } from '../generated/prisma/client';
import {
  canChangeRole,
  canDeleteComment,
  canDeleteTask,
  canEditComment,
  canInvite,
  canRemove,
} from './policies';
import { hasAtLeast, outranks } from './roles';

const { OWNER, ADMIN, MANAGER, MEMBER } = Role;

describe('role ladder', () => {
  it('compares roles by rank', () => {
    expect(hasAtLeast(ADMIN, MANAGER)).toBe(true);
    expect(hasAtLeast(MANAGER, MANAGER)).toBe(true);
    expect(hasAtLeast(MEMBER, MANAGER)).toBe(false);
    expect(outranks(OWNER, ADMIN)).toBe(true);
    expect(outranks(ADMIN, ADMIN)).toBe(false);
  });
});

describe('canInvite', () => {
  it.each([
    [OWNER, ADMIN, true],
    [OWNER, MANAGER, true],
    [OWNER, MEMBER, true],
    [OWNER, OWNER, false],
    [ADMIN, MANAGER, true],
    [ADMIN, MEMBER, true],
    [ADMIN, ADMIN, false],
    [ADMIN, OWNER, false],
    [MANAGER, MEMBER, true],
  ])('%s inviting %s -> %s', (actor, invited, expected) => {
    expect(canInvite(actor, invited)).toBe(expected);
  });
});

describe('canChangeRole', () => {
  const other = (role: Role) => ({ role, isSelf: false });

  it('lets an owner set any non-owner role on anyone below', () => {
    expect(canChangeRole(OWNER, other(ADMIN), MEMBER)).toBe(true);
    expect(canChangeRole(OWNER, other(MEMBER), ADMIN)).toBe(true);
  });

  it('lets an admin manage only managers and members, and only up to manager', () => {
    expect(canChangeRole(ADMIN, other(MEMBER), MANAGER)).toBe(true);
    expect(canChangeRole(ADMIN, other(MANAGER), MEMBER)).toBe(true);
    expect(canChangeRole(ADMIN, other(MEMBER), ADMIN)).toBe(false);
    expect(canChangeRole(ADMIN, other(ADMIN), MEMBER)).toBe(false);
    expect(canChangeRole(ADMIN, other(OWNER), MEMBER)).toBe(false);
  });

  it('never assigns OWNER and never lets anyone change their own role', () => {
    expect(canChangeRole(OWNER, other(ADMIN), OWNER)).toBe(false);
    expect(canChangeRole(OWNER, { role: OWNER, isSelf: true }, ADMIN)).toBe(false);
    expect(canChangeRole(ADMIN, { role: ADMIN, isSelf: true }, MEMBER)).toBe(false);
  });
});

describe('canDeleteTask', () => {
  it('lets creators delete their own tasks', () => {
    expect(canDeleteTask(MEMBER, { createdById: 'u1' }, 'u1')).toBe(true);
  });

  it("lets managers and above delete anyone's tasks, but not plain members", () => {
    expect(canDeleteTask(MANAGER, { createdById: 'u2' }, 'u1')).toBe(true);
    expect(canDeleteTask(ADMIN, { createdById: 'u2' }, 'u1')).toBe(true);
    expect(canDeleteTask(MEMBER, { createdById: 'u2' }, 'u1')).toBe(false);
  });
});

describe('comment policies', () => {
  it('lets only the author edit, whatever their role', () => {
    expect(canEditComment({ authorId: 'u1' }, 'u1')).toBe(true);
    expect(canEditComment({ authorId: 'u1' }, 'u2')).toBe(false);
  });

  it("lets authors delete their own comments and managers and above delete anyone's", () => {
    expect(canDeleteComment(MEMBER, { authorId: 'u1' }, 'u1')).toBe(true);
    expect(canDeleteComment(MANAGER, { authorId: 'u2' }, 'u1')).toBe(true);
    expect(canDeleteComment(OWNER, { authorId: 'u2' }, 'u1')).toBe(true);
    expect(canDeleteComment(MEMBER, { authorId: 'u2' }, 'u1')).toBe(false);
  });
});

describe('canRemove', () => {
  it('lets members leave, but not the owner', () => {
    expect(canRemove(MEMBER, { role: MEMBER, isSelf: true })).toBe(true);
    expect(canRemove(ADMIN, { role: ADMIN, isSelf: true })).toBe(true);
    expect(canRemove(OWNER, { role: OWNER, isSelf: true })).toBe(false);
  });

  it('requires outranking the person you remove', () => {
    expect(canRemove(ADMIN, { role: MEMBER, isSelf: false })).toBe(true);
    expect(canRemove(ADMIN, { role: ADMIN, isSelf: false })).toBe(false);
    expect(canRemove(ADMIN, { role: OWNER, isSelf: false })).toBe(false);
    expect(canRemove(OWNER, { role: ADMIN, isSelf: false })).toBe(true);
  });

  it('does not let managers or members remove anyone else', () => {
    expect(canRemove(MANAGER, { role: MEMBER, isSelf: false })).toBe(false);
    expect(canRemove(MEMBER, { role: MEMBER, isSelf: false })).toBe(false);
  });
});
