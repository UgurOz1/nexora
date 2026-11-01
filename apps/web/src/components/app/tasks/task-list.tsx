'use client';

import { useDeferredValue, useState } from 'react';
import { ErrorState } from '@/components/app/query-state';
import { isOverdue } from '@/components/app/tasks/task-card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskPriority, TaskStatus } from '@/lib/api/types';
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, STATUSES } from '@/lib/board';
import { useMembers, useTaskList, type TaskFilters } from '@/lib/queries';
import { cn } from '@/lib/utils';

const day = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

interface TaskListProps {
  orgId: string;
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

export function TaskList({ orgId, projectId, onOpenTask }: TaskListProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  // Typing does not send a request per keystroke: the query follows the deferred value.
  const q = useDeferredValue(search.trim());

  const filters: TaskFilters = {
    ...(q && { q }),
    ...(status && { status }),
    ...(priority && { priority }),
    ...(assigneeId && { assigneeId }),
  };
  const { data, error, isPending, refetch } = useTaskList(orgId, projectId, filters);
  const { data: members } = useMembers(orgId);
  const filtered = Object.keys(filters).length > 0;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <Input
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <NativeSelect
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value as TaskStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority | '')}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by assignee"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value="">Everyone</option>
          {members?.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isPending && <Skeleton className="h-48 w-full" aria-busy="true" aria-label="Loading" />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {filtered ? 'No tasks match these filters.' : 'No tasks yet. Add one from the board.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Tasks of this project</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Title
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Priority
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Assignee
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Due
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((task) => (
                <tr key={task.id} className="border-t">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => onOpenTask(task.id)}
                    >
                      {task.title}
                    </button>
                    {task.isBlocked && (
                      <span className="ml-2 text-xs text-muted-foreground">blocked</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{STATUS_LABELS[task.status]}</td>
                  <td className="px-3 py-2">{PRIORITY_LABELS[task.priority]}</td>
                  <td className="px-3 py-2">{task.assignee?.name ?? '—'}</td>
                  <td
                    className={cn('px-3 py-2', isOverdue(task) && 'font-medium text-destructive')}
                  >
                    {task.dueDate ? day.format(new Date(task.dueDate)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.nextCursor && (
        <p className="text-xs text-muted-foreground">
          Showing the first {data.items.length} matches. Narrow the filters to see others.
        </p>
      )}
    </div>
  );
}
