import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './jwt-auth.guard';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(userId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId };
    return this.jwt.signAsync(payload);
  }

  // Refresh tokens are random opaque strings, not JWTs: they must be revocable, so the DB is the source of truth.
  async issueRefreshToken(
    userId: string,
    meta: ClientMeta,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    return { token, expiresAt };
  }

  async rotateRefreshToken(
    token: string,
    meta: ClientMeta,
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revokedAt) {
      // An already-rotated token came back: someone copied it. Log out every session of this login.
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Conditional update: if two requests race with the same token, only one wins.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const refresh = await this.issueRefreshToken(record.userId, meta, record.familyId);
    return { userId: record.userId, refresh };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
