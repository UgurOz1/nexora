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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { AuthUser, CurrentUser, OrgMembership } from '../common/auth/current-user.decorator';
import { CreateTaskDto, ListTasksQueryDto, MoveTaskDto, UpdateTaskDto } from './dto/tasks.dto';
import {
  BoardResponseDto,
  TaskDetailResponseDto,
  TaskPageResponseDto,
  TaskResponseDto,
} from './dto/tasks.response';
import { TasksService } from './tasks.service';

// Every member can read, create and edit tasks; deleting follows canDeleteTask (creator or MANAGER+).
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('organizations/:orgId')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('projects/:projectId/tasks')
  @ApiCreatedResponse({ type: TaskResponseDto })
  create(
    @CurrentMembership() actor: OrgMembership,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(actor.organizationId, actor, projectId, dto);
  }

  @Get('projects/:projectId/tasks')
  @ApiOkResponse({ type: TaskPageResponseDto })
  listInProject(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(orgId, user.id, query, projectId);
  }

  // The Kanban board: top-level tasks of the project, one column per status, in board order.
  @Get('projects/:projectId/board')
  @ApiOkResponse({ type: BoardResponseDto })
  board(@Param('orgId') orgId: string, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.tasks.board(orgId, projectId);
  }

  // Across all projects of the organization, e.g. "my tasks": ?assigneeId=me&status=TODO
  @Get('tasks')
  @ApiOkResponse({ type: TaskPageResponseDto })
  list(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(orgId, user.id, query);
  }

  @Get('tasks/:taskId')
  @ApiOkResponse({ type: TaskDetailResponseDto })
  get(@Param('orgId') orgId: string, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasks.get(orgId, taskId);
  }

  @Patch('tasks/:taskId')
  @ApiOkResponse({ type: TaskResponseDto })
  update(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(actor.organizationId, actor, taskId, dto);
  }

  // Drag and drop on the board: "put this task in this column, right after that task".
  @Post('tasks/:taskId/move')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TaskResponseDto })
  move(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasks.move(actor.organizationId, actor, taskId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<void> {
    return this.tasks.remove(actor.organizationId, actor, taskId);
  }

  @Post('tasks/:taskId/subtasks')
  @ApiCreatedResponse({ type: TaskResponseDto })
  createSubtask(
    @CurrentMembership() actor: OrgMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.createSubtask(actor.organizationId, actor, taskId, dto);
  }
}
