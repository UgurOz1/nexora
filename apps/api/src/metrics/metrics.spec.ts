import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Env } from '../config/env';
import type { QueuesService } from '../queues/queues.service';
import { routeOf } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

const queues = {
  jobCounts: () => Promise.resolve([{ queue: 'mail', state: 'waiting', count: 3 }]),
} as unknown as QueuesService;
const config = (token?: string) => ({ get: () => token }) as unknown as ConfigService<Env, true>;
const res = { type: jest.fn() } as unknown as Response;

describe('MetricsController', () => {
  it('is switched off (404) when no token is configured', async () => {
    const controller = new MetricsController(new MetricsService(queues), config(undefined));
    await expect(controller.scrape('Bearer anything', res)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('wants the exact token as a bearer token', async () => {
    const controller = new MetricsController(
      new MetricsService(queues),
      config('the-metrics-token-123'),
    );
    for (const header of [undefined, 'the-metrics-token-123', 'Bearer the-metrics-token-12', '']) {
      await expect(controller.scrape(header, res)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    const text = await controller.scrape('Bearer the-metrics-token-123', res);
    expect(text).toContain('queue_jobs{queue="mail",state="waiting"} 3');
  });

  it('still answers when the queue sizes cannot be read', async () => {
    const broken = {
      jobCounts: () => Promise.reject(new Error('redis down')),
    } as unknown as QueuesService;
    const text = await new MetricsService(broken).render();
    expect(text).toContain('process_cpu_seconds_total');
    expect(text).not.toContain('queue_jobs{');
  });
});

describe('routeOf', () => {
  it('is the matched template, or "unmatched"', () => {
    expect(routeOf({ baseUrl: '', route: { path: '/api/v1/tasks/:id' } })).toBe(
      '/api/v1/tasks/:id',
    );
    expect(routeOf({ baseUrl: '/api', route: { path: '/x' } })).toBe('/api/x');
    expect(routeOf({ baseUrl: '' })).toBe('unmatched');
  });
});
