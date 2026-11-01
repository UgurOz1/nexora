'use client';

import Link from 'next/link';
import { CreateOrganizationDialog } from '@/components/app/create-organization-dialog';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/app/query-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizations } from '@/lib/queries';

export function OrganizationsView() {
  const { data, error, isPending, refetch } = useOrganizations();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your organizations</h1>
          <p className="text-sm text-muted-foreground">Pick one to see its projects.</p>
        </div>
        <CreateOrganizationDialog />
      </div>

      {isPending && <ListSkeleton />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data && data.length === 0 && (
        <EmptyState title="You are not part of an organization yet">
          Create one above, or accept an invitation from the email you received.
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((organization) => (
            <li key={organization.id}>
              <Link
                href={`/orgs/${organization.id}`}
                className="block rounded-xl focus-visible:outline-2"
              >
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{organization.name}</CardTitle>
                    <CardDescription className="flex items-center justify-between">
                      {organization.slug}
                      <Badge variant="secondary">{organization.role.toLowerCase()}</Badge>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
