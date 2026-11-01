// The access token lives in a plain variable, i.e. only in memory. It is deliberately not put in
// localStorage or a cookie that JavaScript can read: a script injected into the page (XSS) could
// steal it from there. A page reload loses it, and a refresh call (see refresh.ts) gets a new one
// using the httpOnly refresh cookie, which scripts cannot read.
let accessToken: string | null = null;
const listeners = new Set<() => void>();

export const tokenStore = {
  get: () => accessToken,
  set(token: string) {
    accessToken = token;
    listeners.forEach((listener) => listener());
  },
  clear() {
    accessToken = null;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
