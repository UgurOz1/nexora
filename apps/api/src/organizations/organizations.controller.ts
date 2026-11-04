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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { AuthUser, CurrentUser, OrgMembership } from '../common/auth/current-user.decorator';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { Role } from '../generated/prisma/client';
import {
  AcceptInvitationDto,
  ChangeRoleDto,
  InviteMemberDto,
  OrganizationNameDto,
} from './dto/organizations.dto';
import {
  InvitationResponseDto,
  MemberResponseDto,
  MemberRoleChangeResponseDto,
  OrganizationBriefDto,
  OrganizationDetailDto,
  OrganizationResponseDto,
  OrganizationWithRoleDto,
  PendingInvitationResponseDto,
} from './dto/organizations.response';
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
  @Audited({
    action: AuditAction.OrganizationCreated,
    target: { type: 'organization', resultField: 'id' },
    // The organization is brand new: its id is in the answer, not in the URL.
    organization: ({ result }) => (result as { id: string }).id,
  })
  @ApiCreatedResponse({ type: OrganizationResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: OrganizationNameDto) {
    return this.organizations.create(user.id, dto.name);
  }

  @Get()
  @ApiOkResponse({ type: [OrganizationWithRoleDto] })
  listMine(@CurrentUser() user: AuthUser) {
    return this.organizations.listForUser(user.id);
  }

  @Get(':orgId')
  @ApiOkResponse({ type: OrganizationDetailDto })
  get(@Param('orgId') orgId: string) {
    return this.organizations.get(orgId);
  }

  @Patch(':orgId')
  @MinRole(Role.ADMIN)
  @ApiOkResponse({ type: OrganizationBriefDto })
  rename(@Param('orgId') orgId: string, @Body() dto: OrganizationNameDto) {
    return this.organizations.rename(orgId, dto.name);
  }

  @Delete(':orgId')
  @MinRole(Role.OWNER)
  // Not filed under the organization: its rows are deleted with it, and this record must stay.
  @Audited({
    action: AuditAction.OrganizationDeleted,
    target: { type: 'organization', param: 'orgId' },
    organization: () => null,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
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
  @ApiOkResponse({ type: [MemberResponseDto] })
  list(@Param('orgId') orgId: string) {
    return this.members.list(orgId);
  }

  @Patch(':userId')
  @MinRole(Role.ADMIN)
  @Audited({
    action: AuditAction.MemberRoleChanged,
    target: { type: 'user', param: 'userId' },
    metadata: ({ request }) => ({ newRole: (request.body as { role?: string }).role }),
  })
  @ApiOkResponse({ type: MemberRoleChangeResponseDto })
  changeRole(
    @CurrentMembership() actor: OrgMembership,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.members.changeRole(actor, userId, dto.role);
  }

  // Also how a member leaves: removing yourself.
  @Delete(':userId')
  @Audited({
    action: AuditAction.MemberRemoved,
    target: { type: 'user', param: 'userId' },
    metadata: ({ request }) => ({ left: request.params.userId === request.user?.id }),
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
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
  @Audited({
    action: AuditAction.MemberInvited,
    target: { type: 'invitation', resultField: 'id' },
    metadata: ({ request }) => {
      const { email, role } = request.body as { email?: string; role?: string };
      return { email, role };
    },
  })
  @ApiCreatedResponse({ type: InvitationResponseDto })
  invite(@CurrentMembership() actor: OrgMembership, @Body() dto: InviteMemberDto) {
    return this.invitations.create(actor, dto.email, dto.role);
  }

  @Get()
  @MinRole(Role.ADMIN)
  @ApiOkResponse({ type: [PendingInvitationResponseDto] })
  listPending(@Param('orgId') orgId: string) {
    return this.invitations.listPending(orgId);
  }

  @Delete(':invitationId')
  @MinRole(Role.ADMIN)
  @Audited({
    action: AuditAction.InvitationRevoked,
    target: { type: 'invitation', param: 'invitationId' },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
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
  @Audited({
    action: AuditAction.InvitationAccepted,
    target: { type: 'organization', resultField: 'id' },
    organization: ({ result }) => (result as { id: string }).id,
    metadata: ({ result }) => ({ role: (result as { role: string }).role }),
  })
  @ApiOkResponse({ type: OrganizationWithRoleDto })
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(user.id, dto.token);
  }
}
