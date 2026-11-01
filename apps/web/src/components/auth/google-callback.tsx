'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';

// Google sends people back here via the API, which has already set the refresh cookie. The auth
// provider tries that cookie as soon as the page loads, so all this page does is wait for the
// result and move on. The access token itself never appears in a URL.
export function GoogleCallback() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/orgs');
    } else if (status === 'unauthenticated') {
      router.replace('/login?error=google_failed');
    }
  }, [status, router]);

  return <p className="text-center text-sm text-muted-foreground">Signing you in…</p>;
}
