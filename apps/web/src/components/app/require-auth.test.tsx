import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from './require-auth';

const replace = vi.fn();
let status: 'loading' | 'authenticated' | 'unauthenticated' = 'loading';
let signedOut = false;

vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ status, signedOut }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/orgs/abc/projects/def',
}));

describe('RequireAuth', () => {
  beforeEach(() => {
    replace.mockReset();
    signedOut = false;
  });

  it('shows a placeholder, not private content, while it is still finding out who you are', () => {
    status = 'loading';
    render(
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>,
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends people without a session to sign in, remembering where they wanted to go', () => {
    status = 'unauthenticated';
    window.history.replaceState({}, '', '/orgs/abc/projects/def?tab=tasks');
    render(
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>,
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent('/orgs/abc/projects/def?tab=tasks')}`,
    );
  });

  it('does not remember the page after the person chose to sign out', () => {
    status = 'unauthenticated';
    signedOut = true;
    render(
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>,
    );

    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('shows the page to signed-in users', () => {
    status = 'authenticated';
    render(
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>,
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
