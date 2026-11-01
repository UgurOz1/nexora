import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { UserSummaryDto } from '../../tasks/dto/tasks.response';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CommentBodyDto {
  @ApiProperty({
    maxLength: 5000,
    description: 'Plain text. Mention a member with @[Name](userId).',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class ListCommentsQueryDto extends PaginationQueryDto {}

export class CommentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  taskId!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  editedAt!: string | null;

  @ApiProperty({ type: UserSummaryDto })
  author!: UserSummaryDto;
}

export class CommentPageResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  items!: CommentResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
