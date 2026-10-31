'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { safeNextPath } from '@/lib/auth/safe-next';

// Wraps the sign-in screens. Someone who is already signed in has no business here, so they are
// sent on: to the page they originally wanted (?next=...) or to their organizations.
export function AuthShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      // Read at the moment of redirecting; reading it during render would need a Suspense
      // boundary around the whole layout and leave the page empty until JavaScript runs.
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(safeNextPath(next, '/orgs'));
    }
  }, [status, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <p className="text-center text-2xl font-semibold tracking-tight">NEXORA</p>
        {children}
      </div>
    </main>
  );
}
