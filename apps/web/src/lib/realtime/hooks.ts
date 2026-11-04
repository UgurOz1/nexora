'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { collabKeys } from '../collab-queries';
import { keys, taskKeys } from '../queries';
import { useRealtimeClient } from './realtime-provider';

// Several changes often arrive together (a bulk edit, a recurring task run). One refetch after
// they settle is enough.
const SETTLE_MS = 150;

// While `orgId`/`projectId` is on screen: follow the project's room and refetch what the page
// shows when someone else changes something. The event says only "look again"; the data comes
// from the normal API, which checks permissions like any other request.
export function useProjectLive(orgId: string, projectId: string) {
  const client = useRealtimeClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!client) return;
    const leave = client.subscribe({ organizationId: orgId, projectId });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopListening = client.on('tasks.changed', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // A change of our own is on its way (an optimistic drag): its own refetch will show
        // everything, others' changes included. Refetching now could put the card back for a
        // moment.
        if (queryClient.isMutating() > 0) return;
        void queryClient.invalidateQueries({ queryKey: keys.project(orgId, projectId) });
        void queryClient.invalidateQueries({ queryKey: taskKeys.all(orgId) });
      }, SETTLE_MS);
    });

    return () => {
      clearTimeout(timer);
      stopListening();
      leave();
    };
  }, [client, queryClient, orgId, projectId]);
}

// The bell refreshes when a notification for this person has just been stored.
export function useNotificationsLive(orgId: string) {
  const client = useRealtimeClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!client) return;
    return client.on('notifications.changed', (payload) => {
      const { organizationId } = (payload ?? {}) as { organizationId?: string };
      if (organizationId === orgId) {
        void queryClient.invalidateQueries({ queryKey: collabKeys.notifications(orgId) });
      }
    });
  }, [client, queryClient, orgId]);
}
