import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { TaskEventType } from '../../generated/prisma/client';
import { NotificationTaskDto } from '../../notifications/dto/notifications.dto';
import { UserSummaryDto } from '../../tasks/dto/tasks.response';

export class ActivityQueryDto extends PaginationQueryDto {}

export class ActivityItemResponseDto {
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

  @ApiProperty({ type: NotificationTaskDto })
  task!: NotificationTaskDto;
}

export class ActivityPageResponseDto {
  @ApiProperty({ type: [ActivityItemResponseDto] })
  items!: ActivityItemResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
