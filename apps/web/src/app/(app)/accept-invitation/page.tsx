import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AcceptInvitation } from '@/components/app/accept-invitation';

export const metadata: Metadata = { title: 'Accept invitation' };

export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <AcceptInvitation />
    </Suspense>
  );
}
