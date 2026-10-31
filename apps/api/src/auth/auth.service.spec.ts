import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccountService } from './account.service';
import { AuthService } from './auth.service';
import type { TokenService } from './token.service';

async function setup() {
  const user = { findUnique: jest.fn(), create: jest.fn() };
  const prisma = { user } as unknown as PrismaService;
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue('access-token'),
    issueRefreshToken: jest.fn().mockResolvedValue({ token: 'refresh', expiresAt: new Date() }),
  };
  const account = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
  const config = { get: () => 900 } as unknown as ConfigService<Env, true>;
  const service = new AuthService(
    prisma,
    tokens as unknown as TokenService,
    account as unknown as AccountService,
    config,
  );
  await service.onModuleInit();
  return { service, user, tokens, account };
}

const credentials = { email: 'ada@example.com', password: 'correct horse battery' };

describe('AuthService', () => {
  it('registers a user with a hashed password and starts a session', async () => {
    const { service, user, account } = await setup();
    user.findUnique.mockResolvedValue(null);
    user.create.mockResolvedValue({ id: 'user-1' });

    const session = await service.register({ ...credentials, name: 'Ada' }, {});

    expect(account.sendVerificationEmail).toHaveBeenCalledWith('user-1');

    const [[{ data }]] = user.create.mock.calls as [{ data: { passwordHash: string } }][];
    expect(data.passwordHash).not.toContain(credentials.password);
    await expect(verify(data.passwordHash, credentials.password)).resolves.toBe(true);
    expect(session).toMatchObject({ accessToken: 'access-token', expiresIn: 900 });
  });

  it('rejects registering an email that already exists', async () => {
    const { service, user } = await setup();
    user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(service.register({ ...credentials, name: 'Ada' }, {})).rejects.toThrow(
      ConflictException,
    );
    expect(user.create).not.toHaveBeenCalled();
  });

  it('logs in with the right password', async () => {
    const { service, user } = await setup();
    user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: await hash(credentials.password),
    });

    await expect(service.login(credentials, {})).resolves.toMatchObject({
      accessToken: 'access-token',
    });
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { service, user, tokens } = await setup();

    user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: await hash('other') });
    const wrongPassword = service.login(credentials, {}).then(
      () => new Error('expected login to fail'),
      (e: Error) => e,
    );

    user.findUnique.mockResolvedValue(null);
    const unknownEmail = service.login(credentials, {}).then(
      () => new Error('expected login to fail'),
      (e: Error) => e,
    );

    const [a, b] = await Promise.all([wrongPassword, unknownEmail]);
    expect(a).toBeInstanceOf(UnauthorizedException);
    expect(b).toBeInstanceOf(UnauthorizedException);
    expect(a.message).toBe(b.message);
    expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects password login for Google-only accounts', async () => {
    const { service, user } = await setup();
    user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: null });

    await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
  });
});
