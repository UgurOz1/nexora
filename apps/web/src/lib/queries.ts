'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api/client';
import type {
  Board,
  CreateProjectInput,
  CreateTaskInput,
  TaskPriority,
  TaskStatus,
  UpdateProjectInput,
  UpdateTaskInput,
} from './api/types';
import { useAuth } from './auth/auth-provider';
import { moveInBoard, type Placement } from './board';

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

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  q?: string;
}

export const taskKeys = {
  board: (orgId: string, projectId: string) =>
    [...keys.project(orgId, projectId), 'board'] as const,
  list: (orgId: string, projectId: string, filters: TaskFilters) =>
    [...keys.project(orgId, projectId), 'tasks', filters] as const,
  all: (orgId: string) => ['organizations', orgId, 'tasks'] as const,
  one: (orgId: string, taskId: string) => ['organizations', orgId, 'tasks', taskId] as const,
  history: (orgId: string, taskId: string) =>
    ['organizations', orgId, 'tasks', taskId, 'history'] as const,
  members: (orgId: string) => ['organizations', orgId, 'members'] as const,
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

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: taskKeys.members(orgId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/organizations/{orgId}/members', { params: { path: { orgId } } })),
    enabled: useEnabled(),
    staleTime: 60_000,
  });
}

export function useBoard(orgId: string, projectId: string) {
  return useQuery({
    queryKey: taskKeys.board(orgId, projectId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/projects/{projectId}/board', {
          params: { path: { orgId, projectId } },
        }),
      ),
    enabled: useEnabled(),
  });
}

export function useTaskList(orgId: string, projectId: string, filters: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(orgId, projectId, filters),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/projects/{projectId}/tasks', {
          params: { path: { orgId, projectId }, query: { ...filters, limit: 100 } },
        }),
      ),
    enabled: useEnabled(),
    placeholderData: (previous) => previous,
  });
}

export function useTask(orgId: string, taskId: string | null) {
  return useQuery({
    queryKey: taskKeys.one(orgId, taskId ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/tasks/{taskId}', {
          params: { path: { orgId, taskId: taskId! } },
        }),
      ),
    enabled: useEnabled() && taskId !== null,
    retry: false,
  });
}

export function useTaskHistory(orgId: string, taskId: string) {
  return useQuery({
    queryKey: taskKeys.history(orgId, taskId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/tasks/{taskId}/history', {
          params: { path: { orgId, taskId } },
        }),
      ),
    enabled: useEnabled(),
  });
}

// Every screen that shows tasks (board, list, detail, project task count) reads from the project
// or the task cache; after any change we refetch both.
function useRefreshTasks(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.project(orgId, projectId) }),
      queryClient.invalidateQueries({ queryKey: taskKeys.all(orgId) }),
    ]);
}

export function useCreateTask(orgId: string, projectId: string) {
  const refresh = useRefreshTasks(orgId, projectId);
  return useMutation({
    mutationFn: (body: CreateTaskInput) =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/projects/{projectId}/tasks', {
          params: { path: { orgId, projectId } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useUpdateTask(orgId: string, projectId: string, taskId: string) {
  const refresh = useRefreshTasks(orgId, projectId);
  return useMutation({
    mutationFn: (body: UpdateTaskInput) =>
      unwrap(
        api.PATCH('/api/v1/organizations/{orgId}/tasks/{taskId}', {
          params: { path: { orgId, taskId } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useDeleteTask(orgId: string, projectId: string, taskId: string) {
  const refresh = useRefreshTasks(orgId, projectId);
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE('/api/v1/organizations/{orgId}/tasks/{taskId}', {
          params: { path: { orgId, taskId } },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useCreateSubtask(orgId: string, projectId: string, taskId: string) {
  const refresh = useRefreshTasks(orgId, projectId);
  return useMutation({
    mutationFn: (title: string) =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/tasks/{taskId}/subtasks', {
          params: { path: { orgId, taskId } },
          body: { title },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useAddDependency(orgId: string, projectId: string, taskId: string) {
  const refresh = useRefreshTasks(orgId, projectId);
  return useMutation({
    mutationFn: (dependsOnId: string) =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/tasks/{taskId}/dependencies', {
          params: { path: { orgId, taskId } },
          body: { dependsOnId },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useRemoveDependency(orgId: string, projectId: string, taskId: string) {
  const refresh = useRefreshTasks(orgId, projectId);
  return useMutation({
    mutationFn: (dependsOnId: string) =>
      unwrap(
        api.DELETE('/api/v1/organizations/{orgId}/tasks/{taskId}/dependencies/{dependsOnId}', {
          params: { path: { orgId, taskId, dependsOnId } },
        }),
      ),
    onSuccess: refresh,
  });
}

// Optimistic move: the card jumps right away, and if the server says no (a blocked task, a card
// that was deleted by someone else, a network error) the previous board is put back.
export function useMoveTask(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshTasks(orgId, projectId);
  const boardKey = taskKeys.board(orgId, projectId);

  return useMutation({
    mutationFn: ({ taskId, ...placement }: Placement & { taskId: string }) =>
      unwrap(
        api.POST('/api/v1/organizations/{orgId}/tasks/{taskId}/move', {
          params: { path: { orgId, taskId } },
          body: placement.afterId === null ? { status: placement.status } : placement,
        }),
      ),
    onMutate: async ({ taskId, ...placement }) => {
      // A refetch that lands mid-flight would overwrite the optimistic board with old data.
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<Board>(boardKey);
      if (previous) {
        queryClient.setQueryData<Board>(boardKey, moveInBoard(previous, taskId, placement));
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
    },
    // Success or failure, the server's version is the truth.
    onSettled: refresh,
  });
}
