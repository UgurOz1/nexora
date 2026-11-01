'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/schemas';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (body) => {
    setFormError(undefined);
    try {
      await unwrap(api.POST('/api/v1/auth/forgot-password', { body }));
      setSent(true);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  const footer = (
    <Link href="/login" className="font-medium text-foreground underline">
      Back to sign in
    </Link>
  );

  // The API answers the same way whether or not the address has an account, and so do we:
  // the screen must not reveal who is registered.
  if (sent) {
    return (
      <AuthCard title="Check your email" footer={footer}>
        <p className="text-sm text-muted-foreground">
          If an account exists for that address, we sent a link to choose a new password. It is
          valid for one hour.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we will send you a link."
      footer={footer}
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  );
}
