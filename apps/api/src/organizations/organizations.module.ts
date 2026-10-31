import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from '../mail/mail.module';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { OrganizationGuard } from './organization.guard';
import {
  InvitationAcceptController,
  MembersController,
  OrganizationInvitationsController,
  OrganizationsController,
} from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [MailModule],
  controllers: [
    OrganizationsController,
    MembersController,
    OrganizationInvitationsController,
    InvitationAcceptController,
  ],
  providers: [
    OrganizationsService,
    MembersService,
    InvitationsService,
    // Must run after JwtAuthGuard (it needs request.user): this module is imported after AuthModule.
    { provide: APP_GUARD, useClass: OrganizationGuard },
  ],
})
export class OrganizationsModule {}
