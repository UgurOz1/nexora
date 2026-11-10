import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import type { DomainEventMap } from '../events/domain-events';
import { MetricsService } from '../metrics/metrics.service';
import { REDIS } from '../redis/redis.module';

// The version key outlives every cached value (TTL at most an hour), so when it expires after a
// quiet day and the version starts again from 0, no value stored under an old 0 is still there.
const VERSION_TTL_SECONDS = 24 * 60 * 60;

// Changes that do not touch any dashboard number.
const IRRELEVANT_TASK_CHANGES = new Set<DomainEventMap['task.changed']['kind']>([
  'comment',
  'attachment',
]);

export function cacheKeyPart(params: Record<string, string | number | undefined>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

// Cache-aside for the dashboard: look in Redis, otherwise compute and store.
//
// Invalidation by VERSION instead of deleting keys: each organization has a counter, and the
// counter is part of every key. A change bumps the counter, so all of the organization's old
// entries stop being read at once (they expire on their own). There is nothing to search for and
// delete, and no race where a slow computation that started before a change writes its stale
// result after the change: it writes under the old version, which nobody reads anymore.
@Injectable()
export class AnalyticsCache {
  private readonly logger = new Logger(AnalyticsCache.name);
  private readonly ttl: number;
  private readonly prefix: string;
  // Requests that miss at the same moment share one computation instead of each running the same
  // heavy queries (a "cache stampede"). Per process; across servers each computes once.
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly metrics: MetricsService,
    config: ConfigService<Env, true>,
  ) {
    this.ttl = config.get('ANALYTICS_CACHE_TTL_SECONDS', { infer: true });
    this.prefix = `${config.get('QUEUE_PREFIX', { infer: true })}:analytics`;
  }

  async getOrCompute<T>(
    organizationId: string,
    name: string,
    params: Record<string, string | number | undefined>,
    compute: () => Promise<T>,
  ): Promise<T> {
    if (this.ttl === 0) return compute();

    let key: string;
    try {
      const version = (await this.redis.get(this.versionKey(organizationId))) ?? '0';
      key = `${this.prefix}:${organizationId}:v${version}:${name}:${cacheKeyPart(params)}`;
      const cached = await this.redis.get(key);
      if (cached !== null) {
        this.count('hit');
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      // Redis is down: answer from the database. Slower, but the page still works.
      this.count('error');
      this.logger.warn({ err: error }, 'Analytics cache unavailable');
      return compute();
    }

    this.count('miss');
    const running = this.inFlight.get(key);
    if (running) return running as Promise<T>;

    const computation = compute()
      .then(async (value) => {
        try {
          await this.redis.set(key, JSON.stringify(value), 'EX', this.ttl);
        } catch (error) {
          this.logger.warn({ err: error }, 'Could not store analytics in the cache');
        }
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, computation);
    return computation;
  }

  async invalidate(organizationId: string): Promise<void> {
    try {
      await this.redis
        .multi()
        .incr(this.versionKey(organizationId))
        .expire(this.versionKey(organizationId), VERSION_TTL_SECONDS)
        .exec();
    } catch (error) {
      // The entries still expire after the TTL; until then the dashboard can be behind.
      this.logger.error({ err: error }, 'Could not invalidate the analytics cache');
    }
  }

  @OnEvent('task.changed')
  onTaskChanged(event: DomainEventMap['task.changed']) {
    if (IRRELEVANT_TASK_CHANGES.has(event.kind)) return;
    return this.invalidate(event.organizationId);
  }

  @OnEvent('project.changed')
  onProjectChanged(event: DomainEventMap['project.changed']) {
    return this.invalidate(event.organizationId);
  }

  @OnEvent('membership.changed')
  onMembershipChanged(event: DomainEventMap['membership.changed']) {
    return this.invalidate(event.organizationId);
  }

  private versionKey(organizationId: string) {
    return `${this.prefix}:${organizationId}:version`;
  }

  private count(result: 'hit' | 'miss' | 'error') {
    this.metrics.cacheRequests.inc({ cache: 'analytics', result });
  }
}
