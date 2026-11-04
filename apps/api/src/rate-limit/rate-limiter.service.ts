import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { REDIS } from '../redis/redis.module';

// Token bucket: a bucket holds up to `capacity` tokens and gains `refillPerSecond` tokens every
// second. Each request takes one. An empty bucket means "too many requests". Compared to a fixed
// window ("100 per minute", reset on the minute) it has no cliff at the window edge, where a
// client could send 100 requests at 12:00:59 and 100 more at 12:01:00, and it allows a short
// burst while still enforcing an average rate.
export interface Bucket {
  capacity: number;
  refillPerSecond: number;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  // Seconds until a request would be allowed again (0 when allowed).
  retryAfterSeconds: number;
}

// The whole read-refill-take-write cycle runs inside Redis as ONE script. Redis runs scripts one
// at a time, so two requests (or two API servers) can never both read the same token count and
// both spend it. The clock is Redis's own (TIME), so servers with slightly different clocks
// still agree. The key expires once the bucket would be full again, so idle clients cost nothing.
const TOKEN_BUCKET = `
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2]) / 1000
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)

local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

tokens = math.min(capacity, tokens + math.max(0, now - ts) * refill_per_ms)

local allowed = 0
local retry_ms = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_ms = math.ceil((1 - tokens) / refill_per_ms)
end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / refill_per_ms) + 1000)
return { allowed, math.floor(tokens), retry_ms }
`;

@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);
  // A property (not read from the config each time) so a test can switch it on for one case.
  enabled: boolean;
  // Same prefix as the queues, so an app (or a test run) only ever sees its own buckets.
  private readonly prefix: string;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('RATE_LIMIT_ENABLED', { infer: true });
    this.prefix = config.get('QUEUE_PREFIX', { infer: true });
  }

  // Takes one token from the bucket named `key`. If Redis cannot be reached the request is let
  // through ("fail open"): a cache outage must not take the whole API down with it. The error is
  // logged, so the outage does not go unnoticed.
  async consume(key: string, bucket: Bucket): Promise<LimitResult> {
    try {
      const [allowed, remaining, retryMs] = (await this.redis.eval(
        TOKEN_BUCKET,
        1,
        `${this.prefix}:${key}`,
        bucket.capacity,
        bucket.refillPerSecond,
      )) as [number, number, number];
      return {
        allowed: allowed === 1,
        remaining,
        retryAfterSeconds: Math.ceil(retryMs / 1000),
      };
    } catch (error) {
      this.logger.error({ err: error }, 'Rate limiter is unavailable; letting the request through');
      return { allowed: true, remaining: bucket.capacity, retryAfterSeconds: 0 };
    }
  }
}
