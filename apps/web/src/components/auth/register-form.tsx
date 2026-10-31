'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-provider';
import { registerSchema, type RegisterValues } from '@/lib/schemas';

export function RegisterForm() {
  const { register: signUp } = useAuth();
  const next = useSearchParams().get('next');
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await signUp(values);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <AuthCard
      title="Create your account"
      description="It takes a minute. We will send you an email to confirm your address."
      footer={
        <span>
          Already have an account?{' '}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-foreground underline"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-4">
        <FormError message={formError} />
        <FormField id="name" label="Name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name')}
          />
        </FormField>
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
        <FormField
          id="password"
          label="Password"
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
