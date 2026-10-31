import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccountService } from './account.service';
import { AuthService } from './auth.service';
import type { GoogleProfile } from './google/google-auth.service';
import type { TokenService } from './token.service';

function setup() {
  const user = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue('access-token'),
    issueRefreshToken: jest.fn().mockResolvedValue({ token: 'refresh', expiresAt: new Date() }),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(
    { user } as unknown as PrismaService,
    tokens as unknown as TokenService,
    {} as AccountService,
    { get: () => 900 } as unknown as ConfigService<Env, true>,
  );
  return { service, user, tokens };
}

const profile: GoogleProfile = {
  googleId: 'google-123',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
};

describe('AuthService.loginWithGoogle', () => {
  it('creates a verified account for a first-time Google user', async () => {
    const { service, user } = setup();
    user.findUnique.mockResolvedValue(null);
    user.create.mockResolvedValue({ id: 'new-user' });

    const session = await service.loginWithGoogle(profile, {});

    expect(user.create).toHaveBeenCalledWith({
      data: {
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        googleId: 'google-123',
        emailVerifiedAt: expect.any(Date),
      },
    });
    expect(session.accessToken).toBe('access-token');
  });

  it('logs in an existing Google user by Google id, even if the email changed', async () => {
    const { service, user, tokens } = setup();
    user.findUnique.mockResolvedValueOnce({ id: 'user-1' });

    await service.loginWithGoogle({ ...profile, email: 'new-address@example.com' }, {});

    expect(user.findUnique).toHaveBeenCalledTimes(1);
    expect(tokens.signAccessToken).toHaveBeenCalledWith('user-1');
    expect(user.create).not.toHaveBeenCalled();
  });

  it('links Google to an existing verified password account and keeps its password', async () => {
    const { service, user, tokens } = setup();
    const verifiedAt = new Date('2026-01-01');
    user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'user-1', emailVerifiedAt: verifiedAt });

    await service.loginWithGoogle(profile, {});

    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { googleId: 'google-123', emailVerifiedAt: verifiedAt },
    });
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('removes the password and sessions of an account whose email was never verified', async () => {
    const { service, user, tokens } = setup();
    user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'user-1', emailVerifiedAt: null });

    await service.loginWithGoogle(profile, {});

    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        googleId: 'google-123',
        emailVerifiedAt: expect.any(Date),
        passwordHash: null,
      },
    });
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('refuses a Google account whose email Google has not verified', async () => {
    const { service, user } = setup();

    await expect(service.loginWithGoogle({ ...profile, emailVerified: false }, {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(user.create).not.toHaveBeenCalled();
  });
});
