import { ApiProperty } from '@nestjs/swagger';
import { TaskEventType, TaskPriority, TaskStatus } from '../../generated/prisma/client';

// Response shapes for the OpenAPI document (and so for the typed web client). They describe what
// TasksService already returns; they change no behaviour.

export class UserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class TaskSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: TaskStatus, enumName: 'TaskStatus' })
  status!: TaskStatus;
}

export class TaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Set for subtasks' })
  parentId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: TaskStatus, enumName: 'TaskStatus' })
  status!: TaskStatus;

  @ApiProperty({ enum: TaskPriority, enumName: 'TaskPriority' })
  priority!: TaskPriority;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueDate!: string | null;

  @ApiProperty({ type: [String] })
  labels!: string[];

  @ApiProperty({ type: String, nullable: true })
  assigneeId!: string | null;

  @ApiProperty({ description: 'Sort key inside its column; opaque to clients' })
  position!: string;

  @ApiProperty({ type: String, nullable: true })
  recurringTaskId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: UserSummaryDto, nullable: true })
  assignee!: UserSummaryDto | null;

  @ApiProperty({ type: UserSummaryDto })
  createdBy!: UserSummaryDto;

  @ApiProperty({ description: 'Subtasks that are not deleted' })
  subtaskCount!: number;

  @ApiProperty({ description: 'True while it waits for a task that is not DONE yet' })
  isBlocked!: boolean;
}

export class TaskDetailResponseDto extends TaskResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  subtasks!: TaskResponseDto[];

  @ApiProperty({ type: [TaskSummaryDto], description: 'Tasks this one waits for' })
  blockedBy!: TaskSummaryDto[];

  @ApiProperty({ type: [TaskSummaryDto], description: 'Tasks that wait for this one' })
  blocks!: TaskSummaryDto[];
}

export class TaskPageResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  items!: TaskResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pass back as `cursor`; null on the last page',
  })
  nextCursor!: string | null;
}

export class BoardColumnResponseDto {
  @ApiProperty({ enum: TaskStatus, enumName: 'TaskStatus' })
  status!: TaskStatus;

  @ApiProperty({ type: [TaskResponseDto], description: 'Ordered top to bottom' })
  tasks!: TaskResponseDto[];

  @ApiProperty({ description: 'True when the column has more tasks than were returned' })
  hasMore!: boolean;
}

export class BoardResponseDto {
  @ApiProperty({
    type: [BoardColumnResponseDto],
    description: 'One column per status, in workflow order',
  })
  columns!: BoardColumnResponseDto[];
}

export class DependencyAddedResponseDto {
  @ApiProperty()
  taskId!: string;

  @ApiProperty({ type: TaskSummaryDto })
  dependsOn!: TaskSummaryDto;
}

export class HistoryEventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TaskEventType, enumName: 'TaskEventType' })
  type!: TaskEventType;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'What this entry changed: { field: { from, to } }',
  })
  changes!: Record<string, { from: unknown; to: unknown }>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: UserSummaryDto, nullable: true, description: 'null when the system acted' })
  actor!: UserSummaryDto | null;
}

export class HistoryPageResponseDto {
  @ApiProperty({ type: [HistoryEventResponseDto] })
  items!: HistoryEventResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
