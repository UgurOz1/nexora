import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Role } from '../../generated/prisma/client';

// A few fixed ranges instead of any number: each distinct query is a separate cache entry, and a
// dashboard needs no more than these.
export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ANALYTICS_RANGES, default: 30, description: 'Days to look back' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(ANALYTICS_RANGES)
  days: AnalyticsRange = 30;

  @ApiPropertyOptional({ description: 'Only this project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class TeamQueryDto {
  @ApiPropertyOptional({ enum: ANALYTICS_RANGES, default: 30, description: 'Days to look back' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(ANALYTICS_RANGES)
  days: AnalyticsRange = 30;
}

export class AnalyticsRangeDto {
  @ApiProperty({ enum: ANALYTICS_RANGES })
  days!: number;

  @ApiProperty({ description: 'Start of the first day (UTC midnight), ISO 8601' })
  from!: string;

  @ApiProperty({ description: 'When the numbers were computed, ISO 8601' })
  generatedAt!: string;
}

export class StatusCountsDto {
  @ApiProperty() TODO!: number;
  @ApiProperty() IN_PROGRESS!: number;
  @ApiProperty() IN_REVIEW!: number;
  @ApiProperty() DONE!: number;
}

export class AnalyticsTotalsDto {
  @ApiProperty({ type: StatusCountsDto })
  byStatus!: StatusCountsDto;

  @ApiProperty({ description: 'Not done and past the due date' })
  overdue!: number;

  @ApiProperty({ description: 'Not done and due within the next 7 days' })
  dueSoon!: number;

  @ApiProperty({ description: 'Finished within the range' })
  completed!: number;

  @ApiProperty({ description: 'Created within the range' })
  created!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Median hours from creation to completion of the tasks finished in the range',
  })
  medianCycleHours!: number | null;
}

export class DailyCountDto {
  @ApiProperty({ example: '2026-11-09', description: 'Day (UTC), YYYY-MM-DD' })
  date!: string;

  @ApiProperty() completed!: number;
  @ApiProperty() created!: number;
}

export class ProjectStatsDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) department!: string | null;
  @ApiProperty({ description: 'Not done' }) open!: number;
  @ApiProperty() done!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty({ description: 'Finished within the range' }) completed!: number;
}

export class DepartmentStatsDto {
  @ApiProperty({ type: String, nullable: true, description: 'Null: projects without one' })
  department!: string | null;

  @ApiProperty() projects!: number;
  @ApiProperty() open!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() completed!: number;
}

export class AnalyticsOverviewDto {
  @ApiProperty({ type: AnalyticsRangeDto })
  range!: AnalyticsRangeDto;

  @ApiProperty({ type: AnalyticsTotalsDto })
  totals!: AnalyticsTotalsDto;

  @ApiProperty({
    type: [DailyCountDto],
    description: 'One entry per day of the range, oldest first',
  })
  daily!: DailyCountDto[];

  @ApiProperty({ type: [ProjectStatsDto], description: 'Most open work first (at most 50)' })
  projects!: ProjectStatsDto[];

  @ApiProperty({ type: [DepartmentStatsDto] })
  departments!: DepartmentStatsDto[];
}

export class MemberStatsDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role!: Role;
  @ApiProperty({ description: 'Assigned and not done' }) open!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty({ description: 'Finished within the range' }) completed!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Median hours, creation to done' })
  medianCycleHours!: number | null;
}

export class UnassignedStatsDto {
  @ApiProperty() open!: number;
  @ApiProperty() overdue!: number;
}

export class TeamStatsDto {
  @ApiProperty({ type: AnalyticsRangeDto })
  range!: AnalyticsRangeDto;

  @ApiProperty({ type: [MemberStatsDto], description: 'Most finished work first' })
  members!: MemberStatsDto[];

  @ApiProperty({
    type: UnassignedStatsDto,
    description: 'Open work with no assignee, or one who has left the organization',
  })
  unassigned!: UnassignedStatsDto;
}
