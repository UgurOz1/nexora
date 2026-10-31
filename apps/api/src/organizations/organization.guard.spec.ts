import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../common/auth/current-user.decorator';
import { Role } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { OrganizationGuard } from './organization.guard';

function setup(options: { membership?: { role: Role } | null; isPublic?: boolean; min?: Role }) {
  const findUnique = jest
    .fn()
    .mockResolvedValue(
      options.membership === null
        ? null
        : { userId: 'u1', organizationId: 'org-1', ...options.membership },
    );
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === 'isPublic' ? options.isPublic : options.min,
    ),
  } as unknown as Reflector;
  const guard = new OrganizationGuard(
    { membership: { findUnique } } as unknown as PrismaService,
    reflector,
  );

  const run = (request: Partial<AuthenticatedRequest>) =>
    guard.canActivate({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext);

  return { run, findUnique };
}

// `null` means "nobody signed in" (undefined would trigger the default value).
const request = (params: Record<string, string>, user: { id: string } | null = { id: 'u1' }) =>
  ({ params, user: user ?? undefined }) as unknown as Partial<AuthenticatedRequest>;

describe('OrganizationGuard', () => {
  it('ignores routes without :orgId', async () => {
    const { run, findUnique } = setup({});

    await expect(run(request({}))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('answers 404 to people who are not members, hiding that the organization exists', async () => {
    const { run } = setup({ membership: null });

    await expect(run(request({ orgId: 'org-1' }))).rejects.toThrow(NotFoundException);
  });

  it('attaches the membership for members', async () => {
    const { run } = setup({ membership: { role: Role.MEMBER } });
    const req = request({ orgId: 'org-1' });

    await expect(run(req)).resolves.toBe(true);
    expect(req.membership).toMatchObject({
      userId: 'u1',
      organizationId: 'org-1',
      role: Role.MEMBER,
    });
  });

  it('answers 403 to members whose role is below the route minimum', async () => {
    const { run } = setup({ membership: { role: Role.MANAGER }, min: Role.ADMIN });

    await expect(run(request({ orgId: 'org-1' }))).rejects.toThrow(ForbiddenException);
  });

  it('lets a role at or above the minimum through', async () => {
    const { run } = setup({ membership: { role: Role.ADMIN }, min: Role.ADMIN });

    await expect(run(request({ orgId: 'org-1' }))).resolves.toBe(true);
  });

  it('fails closed when a route with :orgId has no signed-in user', async () => {
    const { run } = setup({ membership: { role: Role.OWNER } });

    await expect(run(request({ orgId: 'org-1' }, null))).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a route with :orgId that was marked public', async () => {
    const { run } = setup({ membership: { role: Role.OWNER }, isPublic: true });

    await expect(run(request({ orgId: 'org-1' }))).rejects.toThrow(UnauthorizedException);
  });
});
