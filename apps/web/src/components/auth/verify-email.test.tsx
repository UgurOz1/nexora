import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmail } from './verify-email';

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
let search = '';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, api: { POST: (...args: unknown[]) => post(...args) } };
});
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));

function renderPage() {
  // StrictMode runs effects twice in development, exactly what used to break one-time links.
  return render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <VerifyEmail />
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('VerifyEmail', () => {
  beforeEach(() => {
    post.mockReset();
    search = '';
  });

  it('uses the link once, even when React runs the effect twice', async () => {
    search = 'token=abc';
    post.mockResolvedValue({ response: { ok: true, status: 204 } });

    renderPage();

    expect(await screen.findByText('Email confirmed')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/v1/auth/verify-email', { body: { token: 'abc' } });
  });

  it('explains when the link no longer works', async () => {
    search = 'token=used';
    post.mockResolvedValue({
      error: { message: 'This link is invalid or has expired' },
      response: { ok: false, status: 400 },
    });

    renderPage();

    expect(await screen.findByText('We could not confirm your email')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This link is invalid or has expired');
  });

  it('does not call the API when the link has no token', () => {
    renderPage();

    expect(screen.getByText('We could not confirm your email')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
