import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { AuthUser, CurrentUser, OrgMembership } from '../common/auth/current-user.decorator';
import { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from './dto/tasks.dto';
import { TasksService } from './tasks.service';

// Every member can read, create and edit tasks; deleting follows canDeleteTask (creator or MANAGER+).
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('organizations/:orgId')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('projects/:projectId/tasks')
  create(
    @CurrentMembership() actor: OrgMembership,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(actor.organizationId, actor, projectId, dto);
  }

  @Get('projects/:projectId/tasks')
  listInProject(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(orgId, user.id, query, projectId);
  }

  // Across all projects of the organization, e.g. "my tasks": ?assigneeId=me&status=TODO
  @Get('tasks')
  list(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(orgId, user.id, query);
  }

  @Get('tasks/:taskId')
  get(@Param('orgId') orgId: string, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasks.get(orgId, taskId);
  }

  @Patch('tasks/:taskId')
  update(
    @Param('orgId') orgId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(orgId, taskId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<void> {
    return this.tasks.remove(actor.organizationId, actor, taskId);
  }

  @Post('tasks/:taskId/subtasks')
  createSubtask(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.createSubtask(actor.organizationId, actor, taskId, dto);
  }
}
