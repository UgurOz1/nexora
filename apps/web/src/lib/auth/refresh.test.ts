import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAccessToken } from './refresh';
import { tokenStore } from './token-store';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('refreshAccessToken', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    tokenStore.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('stores and returns the new access token', async () => {
    fetchMock.mockResolvedValue(json({ accessToken: 'token-1' }));

    await expect(refreshAccessToken()).resolves.toBe('token-1');
    expect(tokenStore.get()).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });

  it('shares ONE request between callers that ask at the same moment', async () => {
    // Refresh tokens rotate: a second concurrent request would present the cookie the first one
    // just invalidated, which the API treats as theft and logs the user out.
    fetchMock.mockResolvedValue(json({ accessToken: 'token-1' }));

    const results = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(results).toEqual(['token-1', 'token-1', 'token-1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes a new request once the previous one has finished', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ accessToken: 'token-1' }))
      .mockResolvedValueOnce(json({ accessToken: 'token-2' }));

    await refreshAccessToken();
    await expect(refreshAccessToken()).resolves.toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when the session is over, and keeps no token', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Invalid refresh token' }, 401));

    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(tokenStore.get()).toBeNull();
  });

  it('returns null when the network is down instead of throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(refreshAccessToken()).resolves.toBeNull();
  });

  it('can be used again after a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: 'token-2' }));

    await refreshAccessToken();
    await expect(refreshAccessToken()).resolves.toBe('token-2');
  });
});

describe('refreshAccessToken across tabs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('takes the Web Lock so other tabs wait for their turn', async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal('navigator', { locks: { request } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ accessToken: 'token-1' })));

    await refreshAccessToken();

    expect(request).toHaveBeenCalledWith('nexora-refresh', expect.any(Function));
  });
});
