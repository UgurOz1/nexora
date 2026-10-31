import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from '@node-rs/argon2';
import type { Env } from '../config/env';
import { UserTokenType } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, verificationEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken, TokenService } from './token.service';

const HOUR_MS = 60 * 60 * 1000;
const TTL_MS: Record<UserTokenType, number> = {
  EMAIL_VERIFICATION: 24 * HOUR_MS,
  PASSWORD_RESET: HOUR_MS,
};

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) {
      return;
    }
    const token = await this.issue(user.id, UserTokenType.EMAIL_VERIFICATION);
    this.dispatch(verificationEmail(user.email, user.name, this.link('/verify-email', token)));
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consume(token, UserTokenType.EMAIL_VERIFICATION);
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  // Callers always get the same response, whether or not the email exists.
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }
    const token = await this.issue(user.id, UserTokenType.PASSWORD_RESET);
    this.dispatch(passwordResetEmail(user.email, user.name, this.link('/reset-password', token)));
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.consume(token, UserTokenType.PASSWORD_RESET);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(password) },
    });
    // Whoever knew the old password may still hold a session: end all of them.
    await this.tokens.revokeAllForUser(userId);
  }

  private async issue(userId: string, type: UserTokenType): Promise<string> {
    // Only the newest link works: requesting a new email invalidates older ones.
    await this.prisma.userToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = randomBytes(32).toString('base64url');
    await this.prisma.userToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TTL_MS[type]),
      },
    });
    return token;
  }

  // Marks the token used in the same statement that checks it, so a link works exactly once
  // even if it is clicked twice at the same moment.
  private async consume(token: string, type: UserTokenType): Promise<string> {
    const tokenHash = hashToken(token);
    const { count } = await this.prisma.userToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (count === 0) {
      throw new BadRequestException('This link is invalid or has expired');
    }
    const record = await this.prisma.userToken.findUniqueOrThrow({ where: { tokenHash } });
    return record.userId;
  }

  private link(path: string, token: string): string {
    const url = new URL(path, this.config.get('APP_URL', { infer: true }));
    url.searchParams.set('token', token);
    return url.toString();
  }

  // Not awaited: the HTTP response does not wait for SMTP, and its timing does not reveal
  // whether an email was sent (which would leak which addresses have accounts).
  private dispatch(message: Parameters<MailService['send']>[0]): void {
    this.mail.send(message).catch((error: unknown) => {
      this.logger.error({ err: error, subject: message.subject }, 'Failed to send email');
    });
  }
}
