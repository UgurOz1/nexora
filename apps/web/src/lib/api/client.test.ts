import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// The client captures `fetch` when it is created, so every test builds a fresh one against a mock.
async function setup() {
  vi.resetModules();
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const clientModule = await import('./client');
  const { tokenStore } = await import('../auth/token-store');
  return { fetchMock, tokenStore, ...clientModule };
}

// The path of every call. Requests made by the client are Request objects; the refresh call is
// made with a plain URL string.
const calls = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetchMock.mock.calls.map(([input]) =>
    typeof input === 'string' ? input : new URL((input as Request).url).pathname,
  );

const authorizationOf = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index: number) =>
  (fetchMock.mock.calls[index]![0] as Request).headers.get('authorization');

describe('api client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the access token as a bearer token', async () => {
    const { api, tokenStore, fetchMock } = await setup();
    tokenStore.set('abc');
    fetchMock.mockResolvedValue(json([]));

    await api.GET('/api/v1/organizations');

    expect(authorizationOf(fetchMock, 0)).toBe('Bearer abc');
  });

  it('on 401 silently gets a new token and repeats the request once', async () => {
    const { api, tokenStore, fetchMock } = await setup();
    tokenStore.set('expired');
    fetchMock
      .mockResolvedValueOnce(json({ message: 'Invalid or expired access token' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh' })) // POST /auth/refresh
      .mockResolvedValueOnce(json([{ id: 'org-1' }])); // the repeated request

    const { data, response } = await api.GET('/api/v1/organizations');

    expect(response.status).toBe(200);
    expect(data).toEqual([{ id: 'org-1' }]);
    // refused -> new token -> the same request again, now with the new token.
    expect(calls(fetchMock)).toEqual([
      '/api/v1/organizations',
      '/api/v1/auth/refresh',
      '/api/v1/organizations',
    ]);
    expect(authorizationOf(fetchMock, 2)).toBe('Bearer fresh');
  });

  it('tells the app the session is over when the token cannot be renewed', async () => {
    const { api, tokenStore, fetchMock, setSessionEndedHandler } = await setup();
    const ended = vi.fn();
    setSessionEndedHandler(ended);
    tokenStore.set('expired');
    fetchMock
      .mockResolvedValueOnce(json({ message: 'expired' }, 401))
      .mockResolvedValueOnce(json({ message: 'Invalid refresh token' }, 401));

    const { response } = await api.GET('/api/v1/organizations');

    expect(response.status).toBe(401);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('does not refresh after a failed login: the 401 means "wrong password"', async () => {
    const { api, tokenStore, fetchMock } = await setup();
    tokenStore.set('abc');
    fetchMock.mockResolvedValue(json({ message: 'Invalid email or password' }, 401));

    const { response } = await api.POST('/api/v1/auth/login', {
      body: { email: 'a@example.com', password: 'wrong' },
    });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not loop when the repeated request is refused again', async () => {
    const { api, tokenStore, fetchMock } = await setup();
    tokenStore.set('expired');
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(json({ message: 'still no' }, 401));

    const { response } = await api.GET('/api/v1/organizations');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares one refresh between several requests that fail together', async () => {
    const { api, tokenStore, fetchMock } = await setup();
    tokenStore.set('expired');
    fetchMock.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(json({ accessToken: 'fresh' }));
      }
      const authorization = (input as Request).headers.get('authorization');
      return Promise.resolve(authorization === 'Bearer fresh' ? json([]) : json({}, 401));
    });

    const responses = await Promise.all([
      api.GET('/api/v1/organizations'),
      api.GET('/api/v1/auth/me'),
      api.GET('/api/v1/organizations'),
    ]);

    expect(responses.map((r) => r.response.status)).toEqual([200, 200, 200]);
    const refreshCalls = fetchMock.mock.calls.filter(([input]) => input === '/api/v1/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
  });
});

describe('unwrap', () => {
  it('returns the data, or throws an ApiError with the API message', async () => {
    const { unwrap } = await setup();
    const { ApiError } = await import('./errors');

    await expect(
      unwrap(Promise.resolve({ data: { id: 1 }, response: new Response() })),
    ).resolves.toEqual({ id: 1 });

    const failure = unwrap(
      Promise.resolve({
        error: { message: ['name must not be empty', 'email is invalid'] },
        response: new Response(null, { status: 400 }),
      }),
    );
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 400,
      message: 'name must not be empty. email is invalid',
    });
  });
});
