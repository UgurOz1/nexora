import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { NotificationType } from '../../generated/prisma/client';
import { UserSummaryDto } from '../../tasks/dto/tasks.response';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only notifications that have not been read yet' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}

export class NotificationTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  projectId!: string;
}

export class NotificationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type!: NotificationType;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: string | null;

  @ApiProperty({ type: UserSummaryDto, description: 'Who caused it' })
  actor!: UserSummaryDto;

  @ApiProperty({ type: NotificationTaskDto })
  task!: NotificationTaskDto;

  @ApiProperty({ type: String, nullable: true })
  commentId!: string | null;
}

export class NotificationPageResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class UnreadCountResponseDto {
  @ApiProperty()
  count!: number;
}

export class ReadAllResponseDto {
  @ApiProperty({ description: 'How many notifications were marked as read' })
  updated!: number;
}
