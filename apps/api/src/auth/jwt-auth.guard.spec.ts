import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from '../common/auth/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const jwt = new JwtService({
  secret: 'test-secret',
  signOptions: { algorithm: 'HS256' },
  verifyOptions: { algorithms: ['HS256'] },
});

function context(request: Partial<AuthenticatedRequest>) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard(isPublic = false) {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  return new JwtAuthGuard(jwt, reflector);
}

describe('JwtAuthGuard', () => {
  it('lets public routes through without a token', async () => {
    await expect(guard(true).canActivate(context({ headers: {} }))).resolves.toBe(true);
  });

  it('attaches the user for a valid bearer token', async () => {
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${await jwt.signAsync({ sub: 'user-1' })}` },
    };

    await expect(guard().canActivate(context(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1' });
  });

  it('rejects a missing token', async () => {
    await expect(guard().canActivate(context({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'attacker' }).signAsync({ sub: 'user-1' });

    await expect(
      guard().canActivate(context({ headers: { authorization: `Bearer ${forged}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1' })}.`;

    await expect(
      guard().canActivate(context({ headers: { authorization: `Bearer ${unsigned}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
