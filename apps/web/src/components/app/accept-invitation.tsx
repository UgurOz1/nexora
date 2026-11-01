'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form-field';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/api/errors';
import { useAcceptInvitation } from '@/lib/queries';

// The person arrives here from an email, signs in if needed (RequireAuth sends them to the login
// page and back), and confirms. Joining is an explicit click rather than something that happens
// just because a link was opened.
export function AcceptInvitation() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const accept = useAcceptInvitation();
  const [formError, setFormError] = useState<string>();

  if (!token) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>This invitation link is incomplete</CardTitle>
          <CardDescription>Open the link from the email exactly as it was sent.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/orgs" className={buttonVariants({ variant: 'outline' })}>
            Go to your organizations
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>You have been invited</CardTitle>
        <CardDescription>
          Accept to join the organization. You must be signed in with the email address the
          invitation was sent to, and that address must be confirmed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormError message={formError} />
        <Button
          disabled={accept.isPending}
          onClick={() => {
            setFormError(undefined);
            accept.mutate(token, {
              onSuccess: (organization) => {
                toast.success(`You joined ${organization.name}`);
                router.replace(`/orgs/${organization.id}`);
              },
              onError: (error) => setFormError(errorMessage(error)),
            });
          }}
        >
          {accept.isPending ? 'Joining…' : 'Accept invitation'}
        </Button>
      </CardContent>
    </Card>
  );
}
