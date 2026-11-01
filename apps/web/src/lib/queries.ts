'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api/client';
import type { CreateProjectInput, UpdateProjectInput } from './api/types';
import { useAuth } from './auth/auth-provider';

// TanStack Query keeps server data in a cache keyed by these arrays. Two components asking for
// the same key share one request, data is refetched when it goes stale, and after a change we
// invalidate the affected keys so every screen showing that data updates itself. A hand-written
// useEffect + fetch would need all of that rebuilt (loading flags, races, caching, retries).
export const keys = {
  me: ['me'] as const,
  organizations: ['organizations'] as const,
  organization: (orgId: string) => ['organizations', orgId] as const,
  projects: (orgId: string) => ['organizations', orgId, 'projects'] as const,
  project: (orgId: string, projectId: string) =>
    ['organizations', orgId, 'projects', projectId] as const,
};

// Queries only start once we know the user is signed in.
function useEnabled() {
  return useAuth().status === 'authenticated';
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => unwrap(api.GET('/api/v1/auth/me')),
    enabled: useEnabled(),
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: keys.organizations,
    queryFn: () => unwrap(api.GET('/api/v1/organizations')),
    enabled: useEnabled(),
  });
}

export function useOrganization(orgId: string) {
  return useQuery({
    queryKey: keys.organization(orgId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/organizations/{orgId}', { params: { path: { orgId } } })),
    enabled: useEnabled(),
    // A 404 means "not yours or does not exist": asking again will not change the answer.
    retry: false,
  });
}

export function useProjects(orgId: string) {
  return useQuery({
    queryKey: keys.projects(orgId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/organizations/{orgId}/projects', { params: { path: { orgId } } })),
    enabled: useEnabled(),
  });
}

export function useProject(orgId: string, projectId: string) {
  return useQuery({
    queryKey: keys.project(orgId, projectId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/projects/{projectId}', {
          params: { path: { orgId, projectId } },
        }),
      ),
    enabled: useEnabled(),
    retry: false,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => unwrap(api.POST('/api/v1/organizations', { body: { name } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.organizations }),
  });
}

export function useCreateProject(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectInput) =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/projects', {
          params: { path: { orgId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.projects(orgId) }),
  });
}

export function useUpdateProject(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProjectInput) =>
      unwrap(
        api.PATCH('/api/v1/organizations/{orgId}/projects/{projectId}', {
          params: { path: { orgId, projectId } },
          body,
        }),
      ),
    // The list and the single project both show these fields.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.projects(orgId) }),
  });
}

export function useDeleteProject(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE('/api/v1/organizations/{orgId}/projects/{projectId}', {
          params: { path: { orgId, projectId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.projects(orgId) }),
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      unwrap(api.POST('/api/v1/invitations/accept', { body: { token } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.organizations }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/resend-verification')),
  });
}
