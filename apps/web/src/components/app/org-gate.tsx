'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/app/query-state';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/lib/queries';

// Loads the organization from the URL before showing anything inside it. If it is not yours, or
// does not exist, the API gives the same 404 for both (so nobody can probe for names), and so
// does this screen.
export function OrgGate({ orgId, children }: { orgId: string; children: ReactNode }) {
  const { error, isPending, refetch } = useOrganization(orgId);

  if (isPending) {
    return <Skeleton className="h-8 w-48" aria-busy="true" aria-label="Loading" />;
  }
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => void refetch()}
        notFound={
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-6">
              <p className="font-medium">We could not find that organization</p>
              <p className="text-sm text-muted-foreground">
                It may not exist, or you may not be a member of it.
              </p>
              <Link href="/orgs" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Back to your organizations
              </Link>
            </CardContent>
          </Card>
        }
      />
    );
  }
  return <>{children}</>;
}
