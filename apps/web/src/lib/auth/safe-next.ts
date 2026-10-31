// After signing in we send people back to the page they wanted (?next=/orgs/...). That value comes
// from the URL, so anybody can craft a link with ?next=https://evil.example: an "open redirect" that
// makes a phishing page look like it comes from us. Only same-site paths are accepted.
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/')) {
    return fallback;
  }
  // "//evil.example" and "/\evil.example" are read by browsers as another host.
  if (next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}
