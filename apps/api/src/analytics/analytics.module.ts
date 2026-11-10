import { Module } from '@nestjs/common';
import { AnalyticsCache } from './analytics-cache';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsCache],
})
export class AnalyticsModule {}
