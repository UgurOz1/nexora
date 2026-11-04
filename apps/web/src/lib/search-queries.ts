'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api/client';
import { useAuth } from './auth/auth-provider';

// Searches the organization. Nothing is asked for an empty box; while the next letters are being
// typed the previous results stay on screen instead of flashing empty.
export function useSearch(orgId: string, text: string) {
  const query = text.trim();
  const authenticated = useAuth().status === 'authenticated';
  return useQuery({
    queryKey: ['organizations', orgId, 'search', query] as const,
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/search', {
          params: { path: { orgId }, query: { q: query, limit: 20 } },
        }),
      ),
    enabled: authenticated && query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
