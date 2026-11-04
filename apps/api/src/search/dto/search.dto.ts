import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { TaskPriority, TaskStatus } from '../../generated/prisma/client';

export const MAX_SEARCH_RESULTS = 50;

export class SearchQueryDto {
  @ApiProperty({ maxLength: 100, description: 'Words to look for; each is matched as a prefix' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ description: 'Only tasks of this project (projects are not searched)' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_SEARCH_RESULTS, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_RESULTS)
  limit: number = 10;
}

export class TaskSearchResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: TaskStatus, enumName: 'TaskStatus' })
  status!: TaskStatus;

  @ApiProperty({ enum: TaskPriority, enumName: 'TaskPriority' })
  priority!: TaskPriority;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  projectName!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Set for subtasks' })
  parentId!: string | null;
}

export class ProjectSearchResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  department!: string | null;
}

export class SearchResponseDto {
  @ApiProperty({ type: [TaskSearchResultDto] })
  tasks!: TaskSearchResultDto[];

  @ApiProperty({ type: [ProjectSearchResultDto] })
  projects!: ProjectSearchResultDto[];
}
