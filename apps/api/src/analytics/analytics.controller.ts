import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { OrgMembership } from '../common/auth/current-user.decorator';
import { Role } from '../generated/prisma/client';
import { MinRole } from '../organizations/roles';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsOverviewDto,
  AnalyticsQueryDto,
  TeamQueryDto,
  TeamStatsDto,
} from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('organizations/:orgId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // Every member: it shows totals of the projects and tasks they can already read.
  @Get('overview')
  @ApiOkResponse({ type: AnalyticsOverviewDto })
  overview(@CurrentMembership() actor: OrgMembership, @Query() query: AnalyticsQueryDto) {
    return this.analytics.overview(actor.organizationId, query.days, query.projectId);
  }

  // MANAGER and above: numbers per person are for the people who plan the work, not for
  // comparing colleagues.
  @Get('team')
  @MinRole(Role.MANAGER)
  @ApiOkResponse({ type: TeamStatsDto })
  team(@CurrentMembership() actor: OrgMembership, @Query() query: TeamQueryDto) {
    return this.analytics.team(actor.organizationId, query.days);
  }
}
