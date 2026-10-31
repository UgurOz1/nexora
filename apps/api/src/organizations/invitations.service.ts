import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashToken } from '../auth/token.service';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import type { Env } from '../config/env';
import { Role } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { invitationEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { canInvite } from './policies';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(actor: OrgMembership, email: string, role: Role) {
    if (!canInvite(actor.role, role)) {
      throw new ForbiddenException('You can only invite people to a role below your own');
    }

    const tenant = this.prisma.forTenant(actor.organizationId);
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const alreadyMember = await tenant.membership.findFirst({
        where: { userId: existingUser.id },
      });
      if (alreadyMember) {
        throw new ConflictException('This person is already a member');
      }
    }

    // One pending invitation per email: a new one replaces the old link.
    await tenant.invitation.deleteMany({ where: { email, acceptedAt: null } });

    const token = randomBytes(32).toString('base64url');
    const invitation = await tenant.invitation.create({
      data: {
        organizationId: actor.organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: actor.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    const [inviter, organization] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    ]);
    const link = new URL('/accept-invitation', this.config.get('APP_URL', { infer: true }));
    link.searchParams.set('token', token);
    // Not awaited: a mail outage must not fail the request.
    this.mail
      .send(invitationEmail(email, inviter.name, organization.name, link.toString()))
      .catch((error: unknown) => {
        this.logger.error({ err: error }, 'Failed to send invitation email');
      });

    return invitation;
  }

  listPending(organizationId: string) {
    return this.prisma.forTenant(organizationId).invitation.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
  }

  async revoke(organizationId: string, invitationId: string): Promise<void> {
    const { count } = await this.prisma
      .forTenant(organizationId)
      .invitation.deleteMany({ where: { id: invitationId, acceptedAt: null } });
    if (count === 0) {
      throw new NotFoundException('Invitation not found');
    }
  }

  // The caller is signed in but belongs to no organization yet, so there is no :orgId here:
  // the single-use token itself is what identifies the invitation.
  async accept(userId: string, token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new BadRequestException('This invitation is invalid or has expired');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // The invitation is for one email address. A forwarded link must not work for someone else,
    // and an unverified account could simply claim any email.
    if (user.email !== invitation.email || !user.emailVerifiedAt) {
      throw new ForbiddenException('Sign in with the invited email address, and verify it first');
    }

    const alreadyMember = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: invitation.organizationId },
      },
    });
    if (alreadyMember) {
      throw new ConflictException('You are already a member of this organization');
    }

    await this.prisma.$transaction(async (tx) => {
      // Claiming the invitation and joining happen together; the conditional update makes
      // sure two simultaneous clicks cannot both succeed.
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) {
        throw new BadRequestException('This invitation is invalid or has expired');
      }
      await tx.membership.create({
        data: { userId, organizationId: invitation.organizationId, role: invitation.role },
      });
    });

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: invitation.organizationId },
      select: { id: true, name: true, slug: true },
    });
    return { ...organization, role: invitation.role };
  }
}
