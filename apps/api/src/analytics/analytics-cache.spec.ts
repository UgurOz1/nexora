import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import type { MetricsService } from '../metrics/metrics.service';
import { AnalyticsCache, cacheKeyPart } from './analytics-cache';

// A small in-memory stand-in for the few Redis commands the cache uses.
function fakeRedis() {
  const store = new Map<string, string>();
  const state = { down: false };
  const redis = {
    state,
    get: jest.fn((key: string): Promise<string | null> =>
      state.down ? Promise.reject(new Error('down')) : Promise.resolve(store.get(key) ?? null),
    ),
    set: jest.fn((key: string, value: string): Promise<string> => {
      if (state.down) return Promise.reject(new Error('down'));
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    multi: () => {
      const ops: (() => void)[] = [];
      const chain = {
        incr: (key: string) => {
          ops.push(() => store.set(key, String(Number(store.get(key) ?? '0') + 1)));
          return chain;
        },
        expire: () => chain,
        exec: () => {
          if (state.down) return Promise.reject(new Error('down'));
          ops.forEach((op) => op());
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };
  return redis;
}

function build(ttl = 300) {
  const redis = fakeRedis();
  const results: string[] = [];
  const metrics = {
    cacheRequests: { inc: ({ result }: { result: string }) => results.push(result) },
  } as unknown as MetricsService;
  const values: Record<string, unknown> = {
    ANALYTICS_CACHE_TTL_SECONDS: ttl,
    QUEUE_PREFIX: 'test',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  const cache = new AnalyticsCache(redis as unknown as Redis, metrics, config);
  return { cache, redis, results };
}

describe('cacheKeyPart', () => {
  it('is the same whatever the order, and leaves out missing values', () => {
    expect(cacheKeyPart({ projectId: 'p', days: 30 })).toBe('days=30&projectId=p');
    expect(cacheKeyPart({ days: 30, projectId: 'p' })).toBe('days=30&projectId=p');
    expect(cacheKeyPart({ days: 7, projectId: undefined })).toBe('days=7');
  });
});

describe('AnalyticsCache', () => {
  it('computes once, then answers from the cache', async () => {
    const { cache, results } = build();
    const compute = jest.fn().mockResolvedValue({ n: 1 });

    expect(await cache.getOrCompute('org', 'overview', { days: 30 }, compute)).toEqual({ n: 1 });
    expect(await cache.getOrCompute('org', 'overview', { days: 30 }, compute)).toEqual({ n: 1 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['miss', 'hit']);
  });

  it('computes again after the organization is invalidated, and only that organization', async () => {
    const { cache } = build();
    const compute = jest.fn().mockResolvedValue(1);
    await cache.getOrCompute('a', 'x', {}, compute);
    await cache.getOrCompute('b', 'x', {}, compute);

    await cache.invalidate('a');
    await cache.getOrCompute('a', 'x', {}, compute);
    await cache.getOrCompute('b', 'x', {}, compute);
    expect(compute).toHaveBeenCalledTimes(3); // a, b, then a again; b still cached
  });

  it('lets requests that miss at the same time share one computation', async () => {
    const { cache } = build();
    let finish!: (value: number) => void;
    const compute = jest.fn(() => new Promise<number>((resolve) => (finish = resolve)));

    const first = cache.getOrCompute('org', 'x', {}, compute);
    const second = cache.getOrCompute('org', 'x', {}, compute);
    // Both lookups have to reach Redis before the computation is shared.
    await new Promise((resolve) => setImmediate(resolve));
    finish(42);

    expect(await Promise.all([first, second])).toEqual([42, 42]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('answers from the database when Redis is down, and counts the error', async () => {
    const { cache, redis, results } = build();
    redis.state.down = true;
    const compute = jest.fn().mockResolvedValue('fresh');

    expect(await cache.getOrCompute('org', 'x', {}, compute)).toBe('fresh');
    expect(results).toEqual(['error']);
    await expect(cache.invalidate('org')).resolves.toBeUndefined(); // logged, not thrown
  });

  it('still answers when storing the result fails', async () => {
    const { cache, redis } = build();
    redis.set.mockRejectedValueOnce(new Error('full'));
    expect(await cache.getOrCompute('org', 'x', {}, () => Promise.resolve(7))).toBe(7);
  });

  it('does not touch Redis at all when the TTL is 0', async () => {
    const { cache, redis } = build(0);
    expect(await cache.getOrCompute('org', 'x', {}, () => Promise.resolve(1))).toBe(1);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('ignores comments and attachments, which change no number', async () => {
    const { cache } = build();
    const compute = jest.fn().mockResolvedValue(1);
    await cache.getOrCompute('org', 'x', {}, compute);

    const event = { organizationId: 'org', actorId: 'u', taskId: 't', projectId: 'p' };
    await cache.onTaskChanged({ ...event, kind: 'comment' });
    await cache.onTaskChanged({ ...event, kind: 'attachment' });
    await cache.getOrCompute('org', 'x', {}, compute);
    expect(compute).toHaveBeenCalledTimes(1);

    await cache.onTaskChanged({ ...event, kind: 'moved' });
    await cache.getOrCompute('org', 'x', {}, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
