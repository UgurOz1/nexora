import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

export class AddDependencyDto {
  @ApiProperty({ description: 'The task that must be DONE before this one can start' })
  @IsUUID()
  dependsOnId!: string;
}

// Page through a task's history, newest first.
export class HistoryQueryDto extends PaginationQueryDto {}

export class CompareVersionsQueryDto {
  @ApiProperty({ description: 'History entry id of the older version' })
  @IsUUID()
  from!: string;

  @ApiProperty({ description: 'History entry id of the newer version' })
  @IsUUID()
  to!: string;
}
