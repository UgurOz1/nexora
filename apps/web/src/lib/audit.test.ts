import { describe, expect, it } from 'vitest';
import { actionLabel, auditDetail } from './audit';

describe('actionLabel', () => {
  it('words known actions and shows unknown ones as they are', () => {
    expect(actionLabel('member.role_changed')).toBe('Role changed');
    expect(actionLabel('something.new')).toBe('something.new');
  });
});

describe('auditDetail', () => {
  const entry = (action: string, metadata: object | null = null) => ({
    action,
    metadata,
    targetId: null,
  });

  it('says what changed', () => {
    expect(auditDetail(entry('member.role_changed', { newRole: 'MANAGER' }))).toBe(
      'new role MANAGER',
    );
    expect(auditDetail(entry('member.invited', { email: 'a@b.co', role: 'MEMBER' }))).toBe(
      'a@b.co as MEMBER',
    );
    expect(auditDetail(entry('member.removed', { left: true }))).toBe('left the organization');
    expect(auditDetail(entry('member.removed', { left: false }))).toBe('removed by an admin');
    expect(auditDetail(entry('auth.login_failed', { email: 'x@y.zz' }))).toBe('x@y.zz');
  });

  it('copes with missing details', () => {
    expect(auditDetail(entry('member.role_changed'))).toBe('new role unknown');
    expect(auditDetail(entry('project.deleted'))).toBe('');
  });
});
