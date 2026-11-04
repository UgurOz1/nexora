// The actions that are written to the audit log. A closed list on purpose: every entry is a
// decision that "this is worth being able to answer for later". Names are noun.verb.
export const AuditAction = {
  AuthLogin: 'auth.login',
  AuthLoginFailed: 'auth.login_failed',
  AuthRegistered: 'auth.registered',
  AuthLogoutAll: 'auth.logout_all',
  AuthPasswordResetRequested: 'auth.password_reset_requested',
  AuthPasswordResetCompleted: 'auth.password_reset_completed',
  OrganizationCreated: 'organization.created',
  OrganizationDeleted: 'organization.deleted',
  MemberInvited: 'member.invited',
  InvitationRevoked: 'invitation.revoked',
  InvitationAccepted: 'invitation.accepted',
  MemberRoleChanged: 'member.role_changed',
  MemberRemoved: 'member.removed',
  ProjectDeleted: 'project.deleted',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];
