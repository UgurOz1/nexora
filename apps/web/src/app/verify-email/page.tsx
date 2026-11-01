import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/components/auth/verify-email';
import { CenteredPage } from '@/components/centered-page';

export const metadata: Metadata = { title: 'Confirm email' };

// Not inside the (auth) group on purpose: that group sends signed-in people away, but someone
// who is already signed in must still be able to confirm their address from the email.
export default function VerifyEmailPage() {
  return (
    <CenteredPage>
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </CenteredPage>
  );
}
