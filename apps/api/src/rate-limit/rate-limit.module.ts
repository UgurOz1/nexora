import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimiter } from './rate-limiter.service';

@Global()
@Module({
  providers: [RateLimiter, { provide: APP_GUARD, useClass: RateLimitGuard }],
  exports: [RateLimiter],
})
export class RateLimitModule {}
