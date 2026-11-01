import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { DependenciesService } from './dependencies.service';
import { AddDependencyDto, CompareVersionsQueryDto, HistoryQueryDto } from './dto/dependencies.dto';
import { DependencyAddedResponseDto, HistoryPageResponseDto } from './dto/tasks.response';
import { HistoryService } from './history.service';

// Dependencies and history of one task. Every member can use them, like the task itself.
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('organizations/:orgId/tasks/:taskId')
export class TaskDetailsController {
  constructor(
    private readonly dependencies: DependenciesService,
    private readonly history: HistoryService,
  ) {}

  @Post('dependencies')
  @ApiCreatedResponse({ type: DependencyAddedResponseDto })
  addDependency(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AddDependencyDto,
  ) {
    return this.dependencies.add(actor, taskId, dto.dependsOnId);
  }

  @Delete('dependencies/:dependsOnId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeDependency(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('dependsOnId', ParseUUIDPipe) dependsOnId: string,
  ): Promise<void> {
    return this.dependencies.remove(actor, taskId, dependsOnId);
  }

  @Get('history')
  @ApiOkResponse({ type: HistoryPageResponseDto })
  listHistory(
    @Param('orgId') orgId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.history.list(orgId, taskId, query);
  }

  // GET .../history/compare?from=<entryId>&to=<entryId>
  @Get('history/compare')
  compareVersions(
    @Param('orgId') orgId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: CompareVersionsQueryDto,
  ) {
    return this.history.compare(orgId, taskId, query.from, query.to);
  }
}
