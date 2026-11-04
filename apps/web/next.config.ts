import type { NextConfig } from 'next';

// The browser only ever talks to this app. Requests to /api/* are forwarded to the NestJS API,
// like a reverse proxy would do in production. Benefits: no CORS to configure, and the API's
// httpOnly refresh cookie is simply a cookie of this site.
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

// Headers every page gets. A full Content-Security-Policy needs nonces for Next.js's inline
// scripts and is tracked as a follow-up in docs/SECURITY.md; these cover the rest.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Nobody may put this app in a frame (clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
};

export default nextConfig;
