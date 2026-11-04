import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { UserSummaryDto } from '../../tasks/dto/tasks.response';
import { ALLOWED_TYPES, MAX_FILE_BYTES } from '../file-rules';

export class CreateAttachmentDto {
  @ApiProperty({ maxLength: 255, example: 'report.pdf' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    enum: ALLOWED_TYPES,
    description: 'The type of the file; checked again on upload',
  })
  @IsIn(ALLOWED_TYPES)
  contentType!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_FILE_BYTES, description: 'Exact size in bytes' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_BYTES)
  size!: number;
}

export class AttachmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty({ enum: ALLOWED_TYPES })
  contentType!: string;

  @ApiProperty({ description: 'Bytes' })
  size!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: UserSummaryDto })
  uploadedBy!: UserSummaryDto;
}

export class UploadInstructionsDto {
  @ApiProperty({ description: 'Send the file here with PUT, within 5 minutes' })
  url!: string;

  @ApiProperty({ enum: ['PUT'] })
  method!: 'PUT';

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Headers the upload must carry, exactly as given',
  })
  headers!: Record<string, string>;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

export class CreatedAttachmentResponseDto {
  @ApiProperty({ type: AttachmentResponseDto })
  attachment!: AttachmentResponseDto;

  @ApiProperty({ type: UploadInstructionsDto })
  upload!: UploadInstructionsDto;
}

export class DownloadLinkResponseDto {
  @ApiProperty({ description: 'Open this within one minute to download the file' })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}
