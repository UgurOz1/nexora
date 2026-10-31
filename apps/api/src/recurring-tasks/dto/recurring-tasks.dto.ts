import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TaskPriority } from '../../generated/prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeLabels = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [...new Set(value.map((v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v)))]
    : value;

export class CreateRecurringTaskDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiProperty({ example: 'Weekly report', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @Transform(normalizeLabels)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(30, { each: true })
  labels?: string[];

  @ApiPropertyOptional({ description: 'Must be a member of the organization' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiProperty({
    description: 'RFC 5545 recurrence rule, frequency DAILY or longer (UTC)',
    example: 'FREQ=WEEKLY;BYDAY=MO',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rrule!: string;

  @ApiPropertyOptional({ description: 'No occurrence happens before this moment. Default: now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({
    description: 'Generated tasks are due this many days after the occurrence',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dueInDays?: number;
}

// `null` clears description, assignee and dueInDays; leaving a field out keeps it unchanged.
export class UpdateRecurringTaskDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @Transform(normalizeLabels)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(30, { each: true })
  labels?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ example: 'FREQ=MONTHLY;BYMONTHDAY=1' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rrule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dueInDays?: number | null;

  @ApiPropertyOptional({
    description: 'Pause or resume. Resuming skips the occurrences missed meanwhile',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
