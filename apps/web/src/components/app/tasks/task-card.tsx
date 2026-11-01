import { CalendarIcon, ListChecksIcon, LockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Task } from '@/lib/api/types';
import { PRIORITY_LABELS } from '@/lib/board';
import { cn } from '@/lib/utils';

const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>): boolean {
  return task.dueDate !== null && task.status !== 'DONE' && new Date(task.dueDate) < new Date();
}

// What a card shows at a glance. Used on the board, in the drag overlay and in the list.
export function TaskSummary({ task }: { task: Task }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium leading-snug">{task.title}</span>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge
          variant={
            task.priority === 'URGENT' || task.priority === 'HIGH' ? 'destructive' : 'secondary'
          }
        >
          {PRIORITY_LABELS[task.priority]}
        </Badge>
        {task.isBlocked && (
          <span className="inline-flex items-center gap-1" title="Waiting for another task">
            <LockIcon className="size-3" aria-hidden />
            Blocked
          </span>
        )}
        {task.subtaskCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecksIcon className="size-3" aria-hidden />
            {task.subtaskCount}
          </span>
        )}
        {task.dueDate && (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              isOverdue(task) && 'font-medium text-destructive',
            )}
          >
            <CalendarIcon className="size-3" aria-hidden />
            {day.format(new Date(task.dueDate))}
          </span>
        )}
        {task.assignee && <span className="ml-auto">{task.assignee.name}</span>}
      </div>
    </div>
  );
}
