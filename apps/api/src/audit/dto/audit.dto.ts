import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { UserSummaryDto } from '../../tasks/dto/tasks.response';
import { AuditAction } from '../audit-actions';

const ACTIONS = Object.values(AuditAction);

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ACTIONS, description: 'Only entries of this action' })
  @IsOptional()
  @IsIn(ACTIONS)
  action?: string;

  @ApiPropertyOptional({ description: 'Only entries caused by this user' })
  @IsOptional()
  @IsUUID()
  actorId?: string;
}

export class AuditLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ACTIONS })
  action!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: UserSummaryDto,
    nullable: true,
    description: 'null when nobody was signed in',
  })
  actor!: UserSummaryDto | null;

  @ApiProperty({ type: String, nullable: true })
  targetType!: string | null;

  @ApiProperty({ type: String, nullable: true })
  targetId!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  ip!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;
}

export class AuditLogPageResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  items!: AuditLogResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
