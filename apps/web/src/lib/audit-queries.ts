'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { api, unwrap } from './api/client';
import type { AuditLogEntry } from './api/types';
import { useAuth } from './auth/auth-provider';

export interface AuditFilters {
  action?: AuditLogEntry['action'];
}

// "Load more" pages through the audit log with the cursor the API hands back.
export function useAuditLogs(orgId: string, filters: AuditFilters) {
  const enabled = useAuth().status === 'authenticated';
  return useInfiniteQuery({
    queryKey: ['organizations', orgId, 'audit-logs', filters] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/audit-logs', {
          params: { path: { orgId }, query: { limit: 25, ...filters, cursor: pageParam } },
        }),
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    // 403/404 are answers, not failures to retry.
    retry: false,
  });
}
