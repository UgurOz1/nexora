import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProjectDto {
  @ApiProperty({ example: 'Website Redesign', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Marketing', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  department?: string;
}

// `null` clears an optional field; leaving a field out keeps it unchanged.
export class UpdateProjectDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  department?: string | null;
}
