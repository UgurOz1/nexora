import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';
import type { GoogleProfile } from './google/google-auth.service';
import { ClientMeta, IssuedRefreshToken, TokenService } from './token.service';

export interface Session {
  accessToken: string;
  expiresIn: number;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService implements OnModuleInit {
  // Used when the email does not exist, so a failed login takes as long either way
  // and response timing does not reveal which emails are registered.
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly account: AccountService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit() {
    this.dummyHash = await hash('dummy-password-for-timing');
  }

  async register(dto: RegisterDto, meta: ClientMeta): Promise<Session> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    // argon2id with the library defaults (19 MiB memory, 2 iterations), the OWASP recommendation.
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash: await hash(dto.password) },
    });
    await this.account.sendVerificationEmail(user.id);
    return this.startSession(user.id, meta);
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<Session> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    const valid = user?.passwordHash
      ? await verify(user.passwordHash, dto.password)
      : (await verify(this.dummyHash, dto.password), false);

    // Same message for unknown email and wrong password: no account enumeration.
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.startSession(user.id, meta);
  }

  async loginWithGoogle(profile: GoogleProfile, meta: ClientMeta): Promise<Session> {
    // We only trust an email address Google itself has verified.
    if (!profile.emailVerified) {
      throw new UnauthorizedException('Your Google email address is not verified');
    }

    const byGoogleId = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });
    if (byGoogleId) {
      return this.startSession(byGoogleId.id, meta);
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (!byEmail) {
      const created = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          googleId: profile.googleId,
          emailVerifiedAt: new Date(),
        },
      });
      return this.startSession(created.id, meta);
    }

    // The email already belongs to a password account: link Google to it.
    // Pre-hijacking defense: if that account never proved it owns the email, someone may have
    // registered it with their own password hoping the real owner signs in with Google later.
    // Drop that password and every session so only the verified owner keeps access.
    const neverVerified = !byEmail.emailVerifiedAt;
    await this.prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.googleId,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        ...(neverVerified && { passwordHash: null }),
      },
    });
    if (neverVerified) {
      await this.tokens.revokeAllForUser(byEmail.id);
    }
    return this.startSession(byEmail.id, meta);
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<Session> {
    const { userId, refresh } = await this.tokens.rotateRefreshToken(refreshToken, meta);
    return {
      accessToken: await this.tokens.signAccessToken(userId),
      expiresIn: this.accessTtl(),
      refresh,
    };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revokeRefreshToken(refreshToken);
  }

  logoutEverywhere(userId: string): Promise<void> {
    return this.tokens.revokeAllForUser(userId);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        memberships: {
          select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async startSession(userId: string, meta: ClientMeta): Promise<Session> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.signAccessToken(userId),
      this.tokens.issueRefreshToken(userId, meta),
    ]);
    return { accessToken, expiresIn: this.accessTtl(), refresh };
  }

  private accessTtl(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }
}
