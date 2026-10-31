import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

// A server component: it only sets the title and places the form. The form itself needs the
// browser (typing, clicking, the URL), so it is a client component, wrapped in Suspense because
// it reads the query string.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
