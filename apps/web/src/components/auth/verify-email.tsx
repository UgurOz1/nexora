'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { buttonVariants } from '@/components/ui/button';
import { api, unwrap } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { keys } from '@/lib/queries';

type State = { phase: 'working' } | { phase: 'done' } | { phase: 'failed'; message: string };

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>(
    token ? { phase: 'working' } : { phase: 'failed', message: 'This link is incomplete.' },
  );
  // The link works only once. In development React runs effects twice; without this guard the
  // second call would fail and show an error even though the first one succeeded.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) {
      return;
    }
    started.current = true;
    unwrap(api.POST('/api/v1/auth/verify-email', { body: { token } }))
      .then(() => {
        setState({ phase: 'done' });
        // If the user is signed in, their profile now says "verified": refresh it.
        void queryClient.invalidateQueries({ queryKey: keys.me });
      })
      .catch((error: unknown) => setState({ phase: 'failed', message: errorMessage(error) }));
  }, [token, queryClient]);

  if (state.phase === 'working') {
    return (
      <AuthCard title="Confirming your email…">
        <p className="text-sm text-muted-foreground">One moment.</p>
      </AuthCard>
    );
  }

  if (state.phase === 'done') {
    return (
      <AuthCard title="Email confirmed">
        <p className="text-sm text-muted-foreground">Thank you. Your address is verified.</p>
        <Link href="/orgs" className={buttonVariants()}>
          Continue
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="We could not confirm your email">
      <p role="alert" className="text-sm text-muted-foreground">
        {state.message} Links expire after 24 hours and work once. Sign in and ask for a new one.
      </p>
      <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
        Go to sign in
      </Link>
    </AuthCard>
  );
}
