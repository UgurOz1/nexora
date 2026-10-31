'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth/auth-provider';

// The access token lives only in browser memory, so the server cannot tell who is asking when
// it renders a page. The check therefore happens here, in the browser: while we find out
// ("loading") we show a skeleton instead of private content, and without a session we go to the
// sign-in page and come back afterwards (?next=...). This keeps the screens from showing; the
// data itself is protected by the API, which answers 401 to anyone without a valid token.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signedOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Someone who just chose to sign out does not need a way back to this page.
      const here = pathname + window.location.search;
      router.replace(signedOut ? '/login' : `/login?next=${encodeURIComponent(here)}`);
    }
  }, [status, signedOut, pathname, router]);

  if (status !== 'authenticated') {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
