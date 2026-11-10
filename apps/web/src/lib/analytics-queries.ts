'use client';

import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api/client';
import { useAuth } from './auth/auth-provider';

export type AnalyticsDays = 7 | 30 | 90;

const analyticsKeys = {
  overview: (orgId: string, days: AnalyticsDays) =>
    ['organizations', orgId, 'analytics', 'overview', days] as const,
  team: (orgId: string, days: AnalyticsDays) =>
    ['organizations', orgId, 'analytics', 'team', days] as const,
};

// The server keeps the numbers in a cache that is dropped on every change, so asking again after
// a minute is cheap; the page also refreshes when the window gets focus again.
const STALE_MS = 60_000;

export function useAnalyticsOverview(orgId: string, days: AnalyticsDays) {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({
    queryKey: analyticsKeys.overview(orgId, days),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/analytics/overview', {
          params: { path: { orgId }, query: { days } },
        }),
      ),
    enabled,
    staleTime: STALE_MS,
    // Keeps the old range on screen while the new one loads, instead of a blank page.
    placeholderData: (previous) => previous,
  });
}

// Only for MANAGER and above (the API answers 403 to anyone else), so `allowed` keeps members
// from sending a request that can only fail.
export function useTeamStats(orgId: string, days: AnalyticsDays, allowed: boolean) {
  const enabled = useAuth().status === 'authenticated' && allowed;
  return useQuery({
    queryKey: analyticsKeys.team(orgId, days),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/analytics/team', {
          params: { path: { orgId }, query: { days } },
        }),
      ),
    enabled,
    staleTime: STALE_MS,
    placeholderData: (previous) => previous,
    retry: false,
  });
}
