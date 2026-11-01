'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError, FormField } from '@/components/form-field';
import { AuthCard } from '@/components/auth/auth-card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-provider';
import { loginSchema, type LoginValues } from '@/lib/schemas';

// Where the API sends people back to when something went wrong during "Sign in with Google".
const GOOGLE_ERRORS: Record<string, string> = {
  google_denied: 'Google sign-in was cancelled.',
  google_invalid_state: 'That sign-in attempt expired. Please try again.',
  google_failed: 'Google sign-in did not work. Try again, or use your email and password.',
};

export function LoginForm() {
  const { login } = useAuth();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | undefined>(
    GOOGLE_ERRORS[params.get('error') ?? ''],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      // On success the auth provider flips to "authenticated" and the page redirects (AuthShell).
      await login(values);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  const next = params.get('next');
  const withNext = (path: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Enter your details to continue."
      footer={
        <span>
          New to NEXORA?{' '}
          <Link href={withNext('/register')} className="font-medium text-foreground underline">
            Create an account
          </Link>
        </span>
      }
    >
      <form
        method="post"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="grid gap-4"
      >
        <FormError message={formError} />
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
        </FormField>
        <div className="text-right text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* A plain link, not a fetch: the browser has to navigate to Google and back. */}
      <a href="/api/v1/auth/google" className={buttonVariants({ variant: 'outline' })}>
        Continue with Google
      </a>
    </AuthCard>
  );
}
