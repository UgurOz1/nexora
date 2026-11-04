import { SetMetadata } from '@nestjs/common';
import type { PolicyName } from './rate-limit.policies';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  policy: PolicyName;
  // Also count against the e-mail address in the request body, so one account cannot be hammered
  // from many IPs (or flooded with mail from one).
  byEmail?: boolean;
}

// Puts a stricter limit than the default on a route.
export const RateLimit = (policy: PolicyName, options: { byEmail?: boolean } = {}) =>
  SetMetadata(RATE_LIMIT_KEY, { policy, ...options } satisfies RateLimitOptions);
