'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ActivityFeed } from '@/components/app/tasks/activity-feed';
import { KanbanBoard } from '@/components/app/tasks/kanban-board';
import { TaskDialog } from '@/components/app/tasks/task-dialog';
import { TaskList } from '@/components/app/tasks/task-list';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/api/types';

type View = 'board' | 'list' | 'activity';

const VIEWS: { id: View; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'list', label: 'List' },
  { id: 'activity', label: 'Activity' },
];

interface TasksSectionProps {
  orgId: string;
  projectId: string;
  role: Role | undefined;
}

export function TasksSection({ orgId, projectId, role }: TasksSectionProps) {
  const [view, setView] = useState<View>('board');
  // The task the person picked in the page, and a ?task=<id> link (from a notification) that
  // they have already closed. The open task is worked out from these two, so there is no effect
  // copying the URL into state.
  const [pickedTaskId, setPickedTaskId] = useState<string | null>(null);
  const [closedLink, setClosedLink] = useState<string | null>(null);
  const linkedTask = useSearchParams().get('task');
  const openTaskId = pickedTaskId ?? (linkedTask !== closedLink ? linkedTask : null);
  const setOpenTaskId = setPickedTaskId;

  return (
    <section aria-labelledby="tasks-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          Tasks
        </h2>
        <div role="group" aria-label="Task view" className="flex gap-1">
          {VIEWS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={view === option.id ? 'default' : 'outline'}
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {view === 'board' && (
        <KanbanBoard orgId={orgId} projectId={projectId} onOpenTask={setOpenTaskId} />
      )}
      {view === 'list' && (
        <TaskList orgId={orgId} projectId={projectId} onOpenTask={setOpenTaskId} />
      )}
      {view === 'activity' && (
        <ActivityFeed orgId={orgId} projectId={projectId} onOpenTask={setOpenTaskId} />
      )}

      <TaskDialog
        orgId={orgId}
        projectId={projectId}
        role={role}
        taskId={openTaskId}
        onClose={() => {
          setPickedTaskId(null);
          setClosedLink(linkedTask);
        }}
        onOpenTask={setOpenTaskId}
      />
    </section>
  );
}
