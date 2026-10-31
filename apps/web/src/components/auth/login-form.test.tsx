import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { LoginForm } from './login-form';

const login = vi.fn();
let search = '';

vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ login }) }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    login.mockReset();
    search = '';
  });

  it('shows what is wrong before anything is sent', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('marks invalid fields for assistive technology', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const email = await screen.findByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter a valid email address');
  });

  it('signs in with what was typed', async () => {
    const user = userEvent.setup();
    login.mockResolvedValue(undefined);
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' }),
    );
  });

  it("shows the API's message when the credentials are wrong", async () => {
    const user = userEvent.setup();
    login.mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('does not leak unexpected errors, only a generic message', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue(new TypeError('Cannot read properties of undefined'));
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('explains what happened when Google sends the user back with an error', () => {
    search = 'error=google_denied';
    render(<LoginForm />);

    expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in was cancelled');
  });

  it('offers Google sign-in as a real link (the browser must navigate)', () => {
    render(<LoginForm />);

    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/v1/auth/google',
    );
  });
});
