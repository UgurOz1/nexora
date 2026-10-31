import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../common/auth/public.decorator';
import { DatabaseHealthIndicator } from './database.health';
import { RedisHealthIndicator } from './redis.health';

// Version-neutral: load balancers and Docker probe /api/health, independent of API versions.
@ApiTags('health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.database.isHealthy(), () => this.redis.isHealthy()]);
  }
}
