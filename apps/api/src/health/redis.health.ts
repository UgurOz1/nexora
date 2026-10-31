import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS) private readonly redis: Pick<Redis, 'ping'>,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key = 'redis') {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.redis.ping();
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
