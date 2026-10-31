import { describe, expect, it } from 'vitest';
import { hasAtLeast } from './roles';
import {
  loginSchema,
  organizationSchema,
  projectSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas';

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('form schemas', () => {
  it('login: needs a valid email and any password', () => {
    expect(loginSchema.safeParse({ email: 'ada@example.com', password: 'x' }).success).toBe(true);
    expect(firstError(loginSchema.safeParse({ email: 'nope', password: 'x' }))).toBe(
      'Enter a valid email address',
    );
    expect(firstError(loginSchema.safeParse({ email: 'ada@example.com', password: '' }))).toBe(
      'Enter your password',
    );
  });

  it('register: enforces the same limits as the API', () => {
    const ok = { name: '  Ada  ', email: 'ada@example.com', password: 'long enough' };
    expect(registerSchema.parse(ok).name).toBe('Ada'); // trimmed
    expect(firstError(registerSchema.safeParse({ ...ok, password: 'short' }))).toBe(
      'Use at least 8 characters',
    );
    expect(registerSchema.safeParse({ ...ok, password: 'x'.repeat(129) }).success).toBe(false);
    expect(firstError(registerSchema.safeParse({ ...ok, name: '   ' }))).toBe('Enter your name');
  });

  it('reset password: both fields must match', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'long enough', confirm: 'long enough' }).success,
    ).toBe(true);
    const mismatch = resetPasswordSchema.safeParse({
      password: 'long enough',
      confirm: 'different',
    });
    expect(firstError(mismatch)).toBe('The passwords do not match');
    expect(mismatch.error?.issues[0]?.path).toEqual(['confirm']);
  });

  it('organization and project names are trimmed and limited', () => {
    expect(organizationSchema.parse({ name: '  Acme  ' }).name).toBe('Acme');
    expect(organizationSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(projectSchema.safeParse({ name: '', department: '', description: '' }).success).toBe(
      false,
    );
    expect(projectSchema.safeParse({ name: 'Site', department: '', description: '' }).success).toBe(
      true,
    );
    expect(
      projectSchema.safeParse({ name: 'Site', department: '', description: 'x'.repeat(2001) })
        .success,
    ).toBe(false);
  });
});

describe('hasAtLeast', () => {
  it('orders the roles OWNER > ADMIN > MANAGER > MEMBER', () => {
    expect(hasAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(hasAtLeast('MANAGER', 'MANAGER')).toBe(true);
    expect(hasAtLeast('MEMBER', 'MANAGER')).toBe(false);
    expect(hasAtLeast(undefined, 'MEMBER')).toBe(false); // role not loaded yet: show nothing
  });
});
