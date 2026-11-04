import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../common/auth/current-user.decorator';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';
import { POLICIES } from './rate-limit.policies';
import { RateLimiter } from './rate-limiter.service';

// Registered globally, after the JWT guard: by the time it runs we know who the caller is.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only HTTP requests; WebSocket handlers are not limited here.
    if (!this.limiter.enabled || context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const policy = options?.policy ?? 'default';
    const bucket = POLICIES[policy];

    // Who is being counted. Signed-in users by id (people behind one office router do not
    // share a budget); everyone else by IP address.
    const who = request.user ? `user:${request.user.id}` : `ip:${request.ip ?? 'unknown'}`;
    const keys = [`rl:${policy}:${who}`];
    if (options?.byEmail) {
      const email = (request.body as { email?: unknown } | undefined)?.email;
      if (typeof email === 'string' && email) {
        keys.push(`rl:${policy}:email:${email.trim().toLowerCase()}`);
      }
    }

    // Every key must have a token. (A refused request has still used up the other keys' tokens;
    // that only makes a client that is already over the limit wait slightly longer.)
    const results = await Promise.all(keys.map((key) => this.limiter.consume(key, bucket)));
    const denied = results.find((result) => !result.allowed);

    response.setHeader('RateLimit-Limit', String(bucket.capacity));
    response.setHeader('RateLimit-Remaining', String(Math.min(...results.map((r) => r.remaining))));
    if (denied) {
      response.setHeader('Retry-After', String(Math.max(1, denied.retryAfterSeconds)));
      throw new HttpException(
        `Too many requests. Try again in ${Math.max(1, denied.retryAfterSeconds)} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
