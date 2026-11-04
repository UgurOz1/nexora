'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './api/client';
import type { AllowedContentType } from './api/types';
import { sendWithProgress, uploadAttachment } from './attachments';
import { useAuth } from './auth/auth-provider';

const attachmentKeys = {
  list: (orgId: string, taskId: string) =>
    ['organizations', orgId, 'tasks', taskId, 'attachments'] as const,
};

export function useAttachments(orgId: string, taskId: string) {
  const enabled = useAuth().status === 'authenticated';
  return useQuery({
    queryKey: attachmentKeys.list(orgId, taskId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{orgId}/tasks/{taskId}/attachments', {
          params: { path: { orgId, taskId } },
        }),
      ),
    enabled,
  });
}

export function useUploadAttachment(orgId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress: (fraction: number) => void }) =>
      uploadAttachment(
        {
          announce: (info) =>
            unwrap(
              api.POST('/api/v1/organizations/{orgId}/tasks/{taskId}/attachments', {
                params: { path: { orgId, taskId } },
                body: {
                  fileName: info.name,
                  contentType: info.contentType as AllowedContentType,
                  size: info.size,
                },
              }),
            ),
          send: sendWithProgress,
          complete: (id) =>
            unwrap(
              api.POST('/api/v1/organizations/{orgId}/attachments/{id}/complete', {
                params: { path: { orgId, id } },
              }),
            ),
        },
        file,
        onProgress,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(orgId, taskId) }),
  });
}

export function useDeleteAttachment(orgId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/organizations/{orgId}/attachments/{id}', {
          params: { path: { orgId, id } },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(orgId, taskId) }),
  });
}

// Asks for a one-minute download link and opens it. The browser then fetches the file from
// storage directly; the page's own address does not change (the link sends the file as a download).
export async function openDownload(orgId: string, id: string): Promise<void> {
  const { url } = await unwrap(
    api.GET('/api/v1/organizations/{orgId}/attachments/{id}/download', {
      params: { path: { orgId, id } },
    }),
  );
  window.location.assign(url);
}
