import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator', () => {
  const healthIndicatorService = new HealthIndicatorService();

  it('reports up when Redis answers PING', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const indicator = new RedisHealthIndicator(redis, healthIndicatorService);

    await expect(indicator.isHealthy()).resolves.toEqual({ redis: { status: 'up' } });
  });

  it('reports down with the error message when PING fails', async () => {
    const redis = { ping: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const indicator = new RedisHealthIndicator(redis, healthIndicatorService);

    await expect(indicator.isHealthy()).resolves.toEqual({
      redis: { status: 'down', message: 'connection refused' },
    });
  });
});
