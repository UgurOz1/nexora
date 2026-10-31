import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app/app-header';
import { RequireAuth } from '@/components/app/require-auth';
import { VerifyEmailBanner } from '@/components/app/verify-email-banner';

// Everything inside this group needs a signed-in user.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppHeader />
      <VerifyEmailBanner />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </RequireAuth>
  );
}
