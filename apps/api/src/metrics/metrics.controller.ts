import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/auth/public.decorator';
import type { Env } from '../config/env';
import { MetricsService } from './metrics.service';

const digest = (value: string) => createHash('sha256').update(value).digest();

// GET /api/metrics, for Prometheus. Not a user endpoint (no user token, not in the API docs): it
// is protected by its own shared token, and switched off when none is configured.
@ApiExcludeController()
@Public()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  private readonly token?: string;

  constructor(
    private readonly metrics: MetricsService,
    config: ConfigService<Env, true>,
  ) {
    this.token = config.get('METRICS_TOKEN', { infer: true });
  }

  @Get()
  async scrape(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (!this.token) {
      throw new NotFoundException();
    }
    // Compared as hashes in constant time: equal length, and the time taken says nothing about
    // how many leading characters were right.
    const given = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!timingSafeEqual(digest(given), digest(this.token))) {
      throw new UnauthorizedException();
    }
    res.type(this.metrics.contentType);
    return this.metrics.render();
  }
}
