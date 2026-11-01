'use client';

import { useState } from 'react';
import { KanbanBoard } from '@/components/app/tasks/kanban-board';
import { TaskDialog } from '@/components/app/tasks/task-dialog';
import { TaskList } from '@/components/app/tasks/task-list';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/api/types';

type View = 'board' | 'list';

interface TasksSectionProps {
  orgId: string;
  projectId: string;
  role: Role | undefined;
}

export function TasksSection({ orgId, projectId, role }: TasksSectionProps) {
  const [view, setView] = useState<View>('board');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  return (
    <section aria-labelledby="tasks-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          Tasks
        </h2>
        <div role="group" aria-label="Task view" className="flex gap-1">
          {(['board', 'list'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={view === option ? 'default' : 'outline'}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === 'board' ? 'Board' : 'List'}
            </Button>
          ))}
        </div>
      </div>

      {view === 'board' ? (
        <KanbanBoard orgId={orgId} projectId={projectId} onOpenTask={setOpenTaskId} />
      ) : (
        <TaskList orgId={orgId} projectId={projectId} onOpenTask={setOpenTaskId} />
      )}

      <TaskDialog
        orgId={orgId}
        projectId={projectId}
        role={role}
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenTask={setOpenTaskId}
      />
    </section>
  );
}
