import createClient, { type Middleware } from 'openapi-fetch';
import { refreshAccessToken } from '../auth/refresh';
import { tokenStore } from '../auth/token-store';
import { ApiError, messageFromBody } from './errors';
import type { paths } from './schema';

// A fully typed client: the paths, request bodies and responses all come from the API's own
// OpenAPI document (apps/api/openapi.json -> schema.d.ts). Calling a route that does not exist, or
// sending a field the API does not accept, is a compile error, not a runtime surprise.
// The base is this site's own origin: the Next.js server forwards /api/* to the real API. (A
// Request object needs an absolute URL outside a browser page, e.g. in tests; in the browser this
// resolves exactly like a relative URL would.)
const baseUrl = typeof window === 'undefined' ? '' : window.location.origin;

export const api = createClient<paths>({ baseUrl, credentials: 'same-origin' });

// These answer 401 for reasons other than "your access token expired" (wrong password, unusable
// refresh cookie, ...). Refreshing and retrying would be pointless or harmful.
const NO_RETRY =
  /\/api\/v1\/auth\/(login|register|refresh|logout|forgot-password|reset-password|verify-email)$/;

let onSessionEnded: (() => void) | undefined;

// The auth provider registers itself here to find out when the session is over.
export function setSessionEndedHandler(handler: (() => void) | undefined) {
  onSessionEnded = handler;
}

// Copies of in-flight requests, so one that fails with 401 can be sent again.
const retryCopies = new Map<string, Request>();

const authMiddleware: Middleware = {
  onRequest({ request, id }) {
    const token = tokenStore.get();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
      if (!NO_RETRY.test(new URL(request.url).pathname)) {
        retryCopies.set(id, request.clone());
      }
    }
    return request;
  },

  // An access token lives only 15 minutes. When the API says 401 we silently get a new one with
  // the refresh cookie and repeat the request once; the user never notices. If even that fails,
  // the session is really over.
  async onResponse({ response, id }) {
    const copy = retryCopies.get(id);
    retryCopies.delete(id);
    if (response.status !== 401 || !copy) {
      return undefined;
    }

    const token = await refreshAccessToken();
    if (!token) {
      onSessionEnded?.();
      return undefined;
    }
    copy.headers.set('Authorization', `Bearer ${token}`);
    return fetch(copy);
  },

  onError({ id }) {
    retryCopies.delete(id);
    return undefined;
  },
};

api.use(authMiddleware);

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

// Turns openapi-fetch's { data, error } pair into "the data, or a thrown ApiError", which is the
// shape TanStack Query expects from a query or mutation function.
export async function unwrap<T>(result: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await result;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      messageFromBody(error, `Request failed (${response.status})`),
    );
  }
  return data as T;
}
