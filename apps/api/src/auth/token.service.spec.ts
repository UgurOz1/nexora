import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { hashToken, TokenService } from './token.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const createdData = <T>(create: jest.Mock) => (create.mock.calls as [{ data: T }][])[0][0].data;

function setup() {
  const refreshToken = {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = { refreshToken } as unknown as PrismaService;
  const config = { get: () => 30 } as unknown as ConfigService<Env, true>;
  const service = new TokenService(prisma, new JwtService({ secret: 'test' }), config);
  return { service, refreshToken };
}

const storedToken = (overrides: object = {}) => ({
  id: 'rt-1',
  userId: 'user-1',
  familyId: 'family-1',
  expiresAt: new Date(Date.now() + DAY_MS),
  revokedAt: null,
  ...overrides,
});

describe('TokenService', () => {
  it('stores only the hash of a new refresh token', async () => {
    const { service, refreshToken } = setup();

    const { token } = await service.issueRefreshToken('user-1', {});

    const data = createdData<{ tokenHash: string }>(refreshToken.create);
    expect(data.tokenHash).toBe(hashToken(token));
    expect(data.tokenHash).not.toBe(token);
  });

  it('rotates: revokes the presented token and issues a new one in the same family', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(storedToken());

    const { userId, refresh } = await service.rotateRefreshToken('old-token', {});

    expect(userId).toBe('user-1');
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(createdData<{ familyId: string }>(refreshToken.create).familyId).toBe('family-1');
    expect(refresh.token).not.toBe('old-token');
  });

  it('treats a revoked token as stolen and revokes the whole family', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(storedToken({ revokedAt: new Date() }));

    await expect(service.rotateRefreshToken('replayed', {})).rejects.toThrow(
      'Refresh token reuse detected',
    );
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokes the family when a concurrent request already used the token', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(storedToken());
    refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.rotateRefreshToken('raced', {})).rejects.toThrow(UnauthorizedException);
    expect(refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects unknown and expired tokens', async () => {
    const { service, refreshToken } = setup();

    refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotateRefreshToken('unknown', {})).rejects.toThrow(UnauthorizedException);

    refreshToken.findUnique.mockResolvedValue(storedToken({ expiresAt: new Date(Date.now() - 1) }));
    await expect(service.rotateRefreshToken('expired', {})).rejects.toThrow(UnauthorizedException);
  });
});
