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
import { AuthUser, CurrentUser, OrgMembership } from '../common/auth/current-user.decorator';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { Role } from '../generated/prisma/client';
import {
  AcceptInvitationDto,
  ChangeRoleDto,
  InviteMemberDto,
  OrganizationNameDto,
} from './dto/organizations.dto';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { OrganizationsService } from './organizations.service';
import { MinRole } from './roles';

// Routes with :orgId are checked by OrganizationGuard (membership + MinRole) before they run.

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: OrganizationNameDto) {
    return this.organizations.create(user.id, dto.name);
  }

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.organizations.listForUser(user.id);
  }

  @Get(':orgId')
  get(@Param('orgId') orgId: string) {
    return this.organizations.get(orgId);
  }

  @Patch(':orgId')
  @MinRole(Role.ADMIN)
  rename(@Param('orgId') orgId: string, @Body() dto: OrganizationNameDto) {
    return this.organizations.rename(orgId, dto.name);
  }

  @Delete(':orgId')
  @MinRole(Role.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('orgId') orgId: string): Promise<void> {
    return this.organizations.remove(orgId);
  }
}

@ApiTags('members')
@ApiBearerAuth()
@Controller('organizations/:orgId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@Param('orgId') orgId: string) {
    return this.members.list(orgId);
  }

  @Patch(':userId')
  @MinRole(Role.ADMIN)
  changeRole(
    @CurrentMembership() actor: OrgMembership,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.members.changeRole(actor, userId, dto.role);
  }

  // Also how a member leaves: removing yourself.
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentMembership() actor: OrgMembership,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.members.remove(actor, userId);
  }
}

@ApiTags('invitations')
@ApiBearerAuth()
@Controller('organizations/:orgId/invitations')
export class OrganizationInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @MinRole(Role.ADMIN)
  invite(@CurrentMembership() actor: OrgMembership, @Body() dto: InviteMemberDto) {
    return this.invitations.create(actor, dto.email, dto.role);
  }

  @Get()
  @MinRole(Role.ADMIN)
  listPending(@Param('orgId') orgId: string) {
    return this.invitations.listPending(orgId);
  }

  @Delete(':invitationId')
  @MinRole(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('orgId') orgId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(orgId, invitationId);
  }
}

@ApiTags('invitations')
@ApiBearerAuth()
@Controller('invitations')
export class InvitationAcceptController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(user.id, dto.token);
  }
}
