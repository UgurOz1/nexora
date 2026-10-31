'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { useMe, useResendVerification } from '@/lib/queries';

// Shown until the person has confirmed their address. Some things (accepting an invitation)
// need a verified address, so it is worth nudging.
export function VerifyEmailBanner() {
  const { data: me } = useMe();
  const resend = useResendVerification();

  if (!me || me.emailVerifiedAt) {
    return null;
  }

  return (
    <div className="border-b bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-2 text-sm">
        <span>
          Please confirm your email address <strong>{me.email}</strong>. We sent you a link.
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={resend.isPending}
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: () => toast.success('A new link is on its way.'),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          {resend.isPending ? 'Sending…' : 'Send it again'}
        </Button>
      </div>
    </div>
  );
}
