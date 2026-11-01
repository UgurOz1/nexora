'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError, FormField } from '@/components/form-field';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/schemas';

export function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) {
      return;
    }
    setFormError(undefined);
    try {
      await unwrap(api.POST('/api/v1/auth/reset-password', { body: { token, password } }));
      setDone(true);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  if (!token) {
    return (
      <AuthCard title="This link is incomplete">
        <p className="text-sm text-muted-foreground">
          Open the link from the email exactly as it was sent, or request a new one.
        </p>
        <Link href="/forgot-password" className={buttonVariants({ variant: 'outline' })}>
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <p className="text-sm text-muted-foreground">
          Your password was updated and you were signed out everywhere else.
        </p>
        <Link href="/login" className={buttonVariants()}>
          Sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form
        method="post"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="grid gap-4"
      >
        <FormError message={formError} />
        <FormField
          id="password"
          label="New password"
          hint="At least 8 characters."
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
        </FormField>
        <FormField id="confirm" label="Repeat the password" error={errors.confirm?.message}>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? 'confirm-error' : undefined}
            {...register('confirm')}
          />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </AuthCard>
  );
}
