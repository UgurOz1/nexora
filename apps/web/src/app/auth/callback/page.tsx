import type { Metadata } from 'next';
import { GoogleCallback } from '@/components/auth/google-callback';
import { CenteredPage } from '@/components/centered-page';

export const metadata: Metadata = { title: 'Signing in' };

export default function GoogleCallbackPage() {
  return (
    <CenteredPage>
      <GoogleCallback />
    </CenteredPage>
  );
}
