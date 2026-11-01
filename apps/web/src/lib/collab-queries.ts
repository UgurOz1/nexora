'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api/client';
import { useAuth } from './auth/auth-provider';
import { keys, taskKeys } from './queries';

// Comments, notifications and the activity feed (week 9). Same approach as queries.ts: every
// screen reads from the cache by key, and a change invalidates the keys it affects.
export const collabKeys = {
  comments: (orgId: string, taskId: string) =>
    ['organizations', orgId, 'tasks', taskId, 'comments'] as const,
  notifications: (orgId: string) => ['organizations', orgId, 'notifications'] as const,
  activity: (orgId: string, projectId: string) =>
    [...keys.project(orgId, projectId), 'activity'] as const,
};

function useEnabled() {
  return useAuth().status === 'authenticated';
}

export function useComments(orgId: string, taskId: string) {
  return useQuery({
    queryKey: collabKeys.comments(orgId, taskId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/tasks/{taskId}/comments', {
          params: { path: { orgId, taskId }, query: { limit: 100 } },
        }),
      ),
    enabled: useEnabled(),
  });
}

export function useAddComment(orgId: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/tasks/{taskId}/comments', {
          params: { path: { orgId, taskId } },
          body: { body },
        }),
      ),
    // The task history and the activity feed show "comment added" too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: collabKeys.comments(orgId, taskId) }),
        queryClient.invalidateQueries({ queryKey: taskKeys.history(orgId, taskId) }),
        queryClient.invalidateQueries({ queryKey: collabKeys.activity(orgId, projectId) }),
      ]),
  });
}

export function useUpdateComment(orgId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      unwrap(
        api.PATCH('/api/v1/organizations/{orgId}/tasks/{taskId}/comments/{commentId}', {
          params: { path: { orgId, taskId, commentId } },
          body: { body },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: collabKeys.comments(orgId, taskId) }),
  });
}

export function useDeleteComment(orgId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      unwrap(
        api.DELETE('/api/v1/organizations/{orgId}/tasks/{taskId}/comments/{commentId}', {
          params: { path: { orgId, taskId, commentId } },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: collabKeys.comments(orgId, taskId) }),
  });
}

// There is no live push yet (that comes in week 10), so the bell asks again every half minute.
const NOTIFICATION_POLL_MS = 30_000;

export function useUnreadCount(orgId: string) {
  return useQuery({
    queryKey: [...collabKeys.notifications(orgId), 'unread-count'],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/notifications/unread-count', {
          params: { path: { orgId } },
        }),
      ),
    enabled: useEnabled(),
    refetchInterval: NOTIFICATION_POLL_MS,
  });
}

export function useNotifications(orgId: string, enabled: boolean) {
  const authenticated = useEnabled();
  return useQuery({
    queryKey: [...collabKeys.notifications(orgId), 'list'],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/notifications', {
          params: { path: { orgId }, query: { limit: 20 } },
        }),
      ),
    enabled: authenticated && enabled,
  });
}

export function useMarkNotificationRead(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/notifications/{id}/read', {
          params: { path: { orgId, id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collabKeys.notifications(orgId) }),
  });
}

export function useMarkAllNotificationsRead(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/notifications/read-all', {
          params: { path: { orgId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collabKeys.notifications(orgId) }),
  });
}

export function useActivity(orgId: string, projectId: string) {
  return useQuery({
    queryKey: collabKeys.activity(orgId, projectId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/projects/{projectId}/activity', {
          params: { path: { orgId, projectId }, query: { limit: 50 } },
        }),
      ),
    enabled: useEnabled(),
  });
}
