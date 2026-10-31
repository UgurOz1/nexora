import { tokenStore } from './token-store';

// Refresh tokens rotate: every use revokes the old token and issues a new one, and presenting a
// revoked token is treated as theft (the whole login is closed). That makes two refresh calls at
// the same moment dangerous: the second one carries the cookie the first one just invalidated,
// and the user gets logged out for doing nothing wrong. Two situations trigger it:
//
//  1. Several parts of one page need a token at once (React also runs effects twice in
//     development). Solved by sharing a single in-flight call.
//  2. Several tabs refresh at once (e.g. after the browser restores them). Solved by a Web Lock,
//     which makes the tabs take turns.
let inFlight: Promise<string | null> | null = null;

async function callRefreshEndpoint(): Promise<string | null> {
  try {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      return null;
    }
    const { accessToken } = (await response.json()) as { accessToken: string };
    tokenStore.set(accessToken);
    return accessToken;
  } catch {
    // Network trouble: we could not renew, so we cannot claim to be signed in.
    return null;
  }
}

async function takeTurnAcrossTabs(work: () => Promise<string | null>): Promise<string | null> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  // `await` also flattens the nested Promise type that LockManager.request declares.
  return locks ? await locks.request('nexora-refresh', work) : await work();
}

// Returns a fresh access token, or null when the session is over (no valid refresh cookie).
export function refreshAccessToken(): Promise<string | null> {
  inFlight ??= takeTurnAcrossTabs(callRefreshEndpoint).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
