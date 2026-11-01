import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { OrgMembership } from '../common/auth/current-user.decorator';
import { ActivityService } from './activity.service';
import { ActivityPageResponseDto, ActivityQueryDto } from './dto/activity.dto';

// Every member can read the activity of their organization (members already see all its tasks).
@ApiTags('activity')
@ApiBearerAuth()
@Controller('organizations/:orgId')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('activity')
  @ApiOkResponse({ type: ActivityPageResponseDto })
  organization(@CurrentMembership() actor: OrgMembership, @Query() query: ActivityQueryDto) {
    return this.activity.list(actor.organizationId, query);
  }

  @Get('projects/:projectId/activity')
  @ApiOkResponse({ type: ActivityPageResponseDto })
  project(
    @CurrentMembership() actor: OrgMembership,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ActivityQueryDto,
  ) {
    return this.activity.list(actor.organizationId, query, projectId);
  }
}
