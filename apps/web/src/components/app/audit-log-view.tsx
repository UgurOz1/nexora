'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/app/query-state';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditLogEntry } from '@/lib/api/types';
import { actionLabel, AUDIT_ACTIONS, auditDetail } from '@/lib/audit';
import { useAuditLogs } from '@/lib/audit-queries';
import { useOrganization, useOrganizations } from '@/lib/queries';
import { hasAtLeast } from '@/lib/roles';

const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' });

export function AuditLogView({ orgId }: { orgId: string }) {
  const { data: organization } = useOrganization(orgId);
  const { data: organizations } = useOrganizations();
  const [action, setAction] = useState<AuditLogEntry['action'] | ''>('');

  const role = organizations?.find((o) => o.id === orgId)?.role;
  // Hiding the page is only courtesy: the API answers 403 to anyone below ADMIN.
  const allowed = role === undefined || hasAtLeast(role, 'ADMIN');
  const logs = useAuditLogs(orgId, action ? { action } : {});

  const entries = logs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href={`/orgs/${orgId}`} className="hover:underline">
          {organization?.name ?? 'Organization'}
        </Link>
        {' / '}
        <span className="text-foreground">Audit log</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Who did what, when and from where. Entries cannot be changed or deleted.
          </p>
        </div>
        <NativeSelect
          aria-label="Filter by action"
          className="w-56"
          value={action}
          onChange={(event) => setAction(event.target.value as AuditLogEntry['action'] | '')}
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {!allowed && (
        <EmptyState title="Owners and admins only">
          The audit log is visible to the owners and admins of this organization.
        </EmptyState>
      )}
      {allowed && logs.isPending && (
        <Skeleton className="h-48 w-full" aria-busy="true" aria-label="Loading" />
      )}
      {allowed && logs.error && (
        <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      )}
      {allowed && logs.data && entries.length === 0 && (
        <EmptyState title="Nothing recorded yet">
          Entries appear as people use the organization.
        </EmptyState>
      )}
      {allowed && entries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Audit log entries, newest first</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  When
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Who
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  What
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Details
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Address
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2">
                    <time dateTime={entry.createdAt}>{time.format(new Date(entry.createdAt))}</time>
                  </td>
                  <td className="px-3 py-2">{entry.actor?.name ?? 'Not signed in'}</td>
                  <td className="px-3 py-2 font-medium">{actionLabel(entry.action)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{auditDetail(entry)}</td>
                  <td
                    className="px-3 py-2 text-muted-foreground"
                    title={entry.userAgent ?? undefined}
                  >
                    {entry.ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {logs.hasNextPage && (
        <Button
          variant="outline"
          disabled={logs.isFetchingNextPage}
          onClick={() => void logs.fetchNextPage()}
        >
          {logs.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
