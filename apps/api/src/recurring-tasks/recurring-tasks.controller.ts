import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { Role } from '../generated/prisma/client';
import { MinRole } from '../organizations/roles';
import { CreateRecurringTaskDto, UpdateRecurringTaskDto } from './dto/recurring-tasks.dto';
import { RecurringTasksService } from './recurring-tasks.service';

// Everyone can see the schedules; creating, changing and removing them needs MANAGER, because a
// template keeps creating work for people.
@ApiTags('recurring-tasks')
@ApiBearerAuth()
@Controller('organizations/:orgId/recurring-tasks')
export class RecurringTasksController {
  constructor(private readonly recurring: RecurringTasksService) {}

  @Post()
  @MinRole(Role.MANAGER)
  create(@CurrentMembership() actor: OrgMembership, @Body() dto: CreateRecurringTaskDto) {
    return this.recurring.create(actor, dto);
  }

  @Get()
  list(@Param('orgId') orgId: string) {
    return this.recurring.list(orgId);
  }

  @Get(':id')
  get(@Param('orgId') orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.get(orgId, id);
  }

  @Patch(':id')
  @MinRole(Role.MANAGER)
  update(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringTaskDto,
  ) {
    return this.recurring.update(orgId, id, dto);
  }

  @Delete(':id')
  @MinRole(Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('orgId') orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.recurring.remove(orgId, id);
  }
}
