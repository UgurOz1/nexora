import type { Bucket } from './rate-limiter.service';

// Named limits. A route picks one with @RateLimit('login'); everything else gets 'default'.
// "capacity" is the burst a client may spend at once, "refillPerSecond" the long-run average.
// Slow, sensitive endpoints (anything that can be used to guess passwords or to make us send
// email) get small buckets that refill over minutes or hours.
const perMinute = (n: number) => n / 60;
const perHour = (n: number) => n / 3600;

export const POLICIES = {
  // Ordinary API traffic, per signed-in user (per IP when anonymous): a burst of 120, 2 a second.
  default: { capacity: 120, refillPerSecond: 2 },
  // Guessing passwords: 5 tries at once, then one every 12 seconds. Counted per IP and, to stop
  // one account being attacked from many IPs, per email address too.
  login: { capacity: 5, refillPerSecond: perMinute(5) },
  // Creating accounts in bulk.
  register: { capacity: 5, refillPerSecond: perHour(5) },
  // Each request can make us send an email: do not let anyone use us to flood an inbox.
  email: { capacity: 3, refillPerSecond: perHour(3) },
  // Single-use token endpoints (verify e-mail, reset password).
  token: { capacity: 10, refillPerSecond: perHour(10) },
  // Search runs a query per request and the web app searches as people type: a burst of 30, then
  // one a second.
  search: { capacity: 30, refillPerSecond: 1 },
  // Announcing an upload hands out a signed link and creates a row: 20, then one every 3 s.
  upload: { capacity: 20, refillPerSecond: 1 / 3 },
  // The Google redirect dance.
  oauth: { capacity: 20, refillPerSecond: perMinute(20) },
} as const satisfies Record<string, Bucket>;

export type PolicyName = keyof typeof POLICIES;
