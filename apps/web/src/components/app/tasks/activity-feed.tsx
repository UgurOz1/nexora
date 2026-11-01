'use client';

import { ErrorState } from '@/components/app/query-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { ActivityItem } from '@/lib/api/types';
import { useActivity } from '@/lib/collab-queries';

const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function describeActivity(item: ActivityItem): string {
  switch (item.type) {
    case 'CREATED':
      return 'created';
    case 'DELETED':
      return 'deleted';
    case 'COMMENT_ADDED':
      return 'commented on';
    case 'DEPENDENCY_ADDED':
      return 'added a dependency to';
    case 'DEPENDENCY_REMOVED':
      return 'removed a dependency from';
    default: {
      // The API documents `changes` as a free-form object: { field: { from, to } }.
      const changes = item.changes as Record<string, { from: unknown; to: unknown }>;
      const status = changes.status;
      if (status) return `moved to ${String(status.to).toLowerCase().replace('_', ' ')}:`;
      const fields = Object.keys(changes);
      return fields.length > 0 ? `changed ${fields.join(', ')} of` : 'updated';
    }
  }
}

interface ActivityFeedProps {
  orgId: string;
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

export function ActivityFeed({ orgId, projectId, onOpenTask }: ActivityFeedProps) {
  const { data, error, isPending, refetch } = useActivity(orgId, projectId);

  if (isPending) return <Skeleton className="h-48 w-full" aria-busy="true" aria-label="Loading" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (data.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing has happened in this project yet.</p>
    );
  }

  return (
    <ol className="grid gap-2">
      {data.items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <span className="font-medium">{item.actor?.name ?? 'The system'}</span>{' '}
            {describeActivity(item)}{' '}
            <button
              type="button"
              className="font-medium hover:underline"
              onClick={() => onOpenTask(item.task.id)}
            >
              {item.task.title}
            </button>
          </span>
          <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>
            {time.format(new Date(item.createdAt))}
          </time>
        </li>
      ))}
      {data.nextCursor && (
        <li className="text-xs text-muted-foreground">
          Showing the latest {data.items.length} events.
        </li>
      )}
    </ol>
  );
}
