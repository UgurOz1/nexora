import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify } from '@node-rs/argon2';
import type { Env } from '../config/env';
import type { MailMessage, MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';
import { hashToken, type TokenService } from './token.service';

function setup() {
  const user = { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  const userToken = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn().mockResolvedValue({}),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'user-1' }),
  };
  const prisma = { user, userToken } as unknown as PrismaService;
  const mail = { send: jest.fn<Promise<void>, [MailMessage]>().mockResolvedValue(undefined) };
  const tokens = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
  const config = { get: () => 'http://localhost:3000' } as unknown as ConfigService<Env, true>;
  const service = new AccountService(
    prisma,
    mail as unknown as MailService,
    tokens as unknown as TokenService,
    config,
  );
  return { service, user, userToken, mail, tokens };
}

const ada = { id: 'user-1', email: 'ada@example.com', name: 'Ada', emailVerifiedAt: null };

// The raw token only exists in the emailed link; pull it back out to act like the user clicking it.
const tokenFromMail = (mail: { send: jest.Mock<Promise<void>, [MailMessage]> }) =>
  new URL(/http\S+/.exec(mail.send.mock.calls[0][0].text)![0]).searchParams.get('token')!;

describe('AccountService', () => {
  it('emails a verification link whose token is stored only as a hash', async () => {
    const { service, user, userToken, mail } = setup();
    user.findUnique.mockResolvedValue(ada);

    await service.sendVerificationEmail('user-1');

    const token = tokenFromMail(mail);
    expect(mail.send.mock.calls[0][0].text).toContain('http://localhost:3000/verify-email?token=');
    expect(userToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tokenHash: hashToken(token), type: 'EMAIL_VERIFICATION' }),
    });
  });

  it('does not email users who are already verified', async () => {
    const { service, user, mail } = setup();
    user.findUnique.mockResolvedValue({ ...ada, emailVerifiedAt: new Date() });

    await service.sendVerificationEmail('user-1');

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('invalidates older links when a new one is issued', async () => {
    const { service, user, userToken } = setup();
    user.findUnique.mockResolvedValue(ada);

    await service.sendVerificationEmail('user-1');

    expect(userToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: 'EMAIL_VERIFICATION', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('verifies the email with a valid token', async () => {
    const { service, user } = setup();

    await service.verifyEmail('token');

    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', emailVerifiedAt: null },
      data: { emailVerifiedAt: expect.any(Date) },
    });
  });

  it('rejects used, expired or unknown tokens', async () => {
    const { service, userToken, user } = setup();
    userToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verifyEmail('token')).rejects.toThrow(BadRequestException);
    expect(user.updateMany).not.toHaveBeenCalled();
  });

  it('sends no email and reveals nothing for an unknown address', async () => {
    const { service, user, mail } = setup();
    user.findUnique.mockResolvedValue(null);

    await expect(service.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('resets the password and ends every existing session', async () => {
    const { service, user, tokens } = setup();

    await service.resetPassword('token', 'a brand new password');

    const [[{ data }]] = user.update.mock.calls as [{ data: { passwordHash: string } }][];
    await expect(verify(data.passwordHash, 'a brand new password')).resolves.toBe(true);
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('does not fail the request when the mail server is down', async () => {
    const { service, user, mail } = setup();
    user.findUnique.mockResolvedValue(ada);
    mail.send.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.requestPasswordReset('ada@example.com')).resolves.toBeUndefined();
  });
});
