import type { NextConfig } from 'next';

// The browser only ever talks to this app. Requests to /api/* are forwarded to the NestJS API,
// like a reverse proxy would do in production. Benefits: no CORS to configure, and the API's
// httpOnly refresh cookie is simply a cookie of this site.
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
};

export default nextConfig;
