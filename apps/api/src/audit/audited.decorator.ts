import { SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth/current-user.decorator';
import type { AuditActionName } from './audit-actions';

export const AUDITED_KEY = 'audited';

// What a route handler did, as far as the audit log can tell.
export interface AuditContext {
  request: AuthenticatedRequest;
  // The handler's return value (on success).
  result?: unknown;
  // What it threw (on failure).
  error?: unknown;
}

export interface AuditedOptions {
  action: AuditActionName;
  // When the handler throws 401 or 403, record this action instead (a failed sign-in).
  failureAction?: AuditActionName;
  target?: {
    type: string;
    // The route parameter holding the target's id ...
    param?: string;
    // ... or a field of the response (for "created" routes, where the id is new).
    resultField?: string;
  };
  // Who acted, when the route is public and there is no signed-in user.
  actor?: (context: AuditContext) => string | undefined;
  // The organization the event belongs to. Default: the one in the URL (set by the org guard).
  organization?: (context: AuditContext) => string | null | undefined;
  metadata?: (context: AuditContext) => Record<string, unknown> | undefined;
}

// Marks a route whose successful use (and, optionally, whose refusal) is written to the audit
// log by the AuditInterceptor. The services stay unaware of auditing: what is audited is
// visible right next to the route, in one place.
export const Audited = (options: AuditedOptions) => SetMetadata(AUDITED_KEY, options);
