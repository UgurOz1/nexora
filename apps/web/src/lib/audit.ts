// Plain-English wording of audit entries. The API stores machine names (member.role_changed);
// people read sentences. Anything this does not know is shown as its raw name, never hidden.
export const AUDIT_ACTIONS: { value: string; label: string }[] = [
  { value: 'auth.login', label: 'Signed in' },
  { value: 'auth.login_failed', label: 'Failed sign-in' },
  { value: 'auth.registered', label: 'Registered' },
  { value: 'auth.logout_all', label: 'Signed out everywhere' },
  { value: 'auth.password_reset_requested', label: 'Password reset requested' },
  { value: 'auth.password_reset_completed', label: 'Password reset' },
  { value: 'organization.created', label: 'Organization created' },
  { value: 'organization.deleted', label: 'Organization deleted' },
  { value: 'member.invited', label: 'Member invited' },
  { value: 'invitation.revoked', label: 'Invitation revoked' },
  { value: 'invitation.accepted', label: 'Invitation accepted' },
  { value: 'member.role_changed', label: 'Role changed' },
  { value: 'member.removed', label: 'Member removed' },
  { value: 'project.deleted', label: 'Project deleted' },
];

const LABELS = new Map(AUDIT_ACTIONS.map((a) => [a.value, a.label]));

export function actionLabel(action: string): string {
  return LABELS.get(action) ?? action;
}

// The details that make an entry useful ("role changed to MANAGER"), in a short phrase.
export function auditDetail(entry: { action: string; metadata?: object | null }): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof meta[key] === 'string' ? meta[key] : undefined);

  switch (entry.action) {
    case 'member.role_changed':
      return `new role ${text('newRole') ?? 'unknown'}`;
    case 'member.invited':
      return `${text('email') ?? 'someone'} as ${text('role') ?? 'MEMBER'}`;
    case 'member.removed':
      return meta.left === true ? 'left the organization' : 'removed by an admin';
    case 'invitation.accepted':
      return `joined as ${text('role') ?? 'MEMBER'}`;
    case 'auth.login_failed':
    case 'auth.password_reset_requested':
      return text('email') ?? '';
    default:
      return '';
  }
}
