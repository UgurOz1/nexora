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
import { Role } from '../generated/prisma/client';
import { MinRole } from '../organizations/roles';
import { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';
import { ProjectsService } from './projects.service';

// Reading is open to every member; changing projects needs MANAGER, deleting needs ADMIN.
@ApiTags('projects')
@ApiBearerAuth()
@Controller('organizations/:orgId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @MinRole(Role.MANAGER)
  create(@Param('orgId') orgId: string, @Body() dto: CreateProjectDto) {
    return this.projects.create(orgId, dto);
  }

  @Get()
  list(@Param('orgId') orgId: string) {
    return this.projects.list(orgId);
  }

  @Get(':projectId')
  get(@Param('orgId') orgId: string, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.get(orgId, projectId);
  }

  @Patch(':projectId')
  @MinRole(Role.MANAGER)
  update(
    @Param('orgId') orgId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(orgId, projectId, dto);
  }

  @Delete(':projectId')
  @MinRole(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId') orgId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    return this.projects.remove(orgId, projectId);
  }
}
