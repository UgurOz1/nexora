'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon, PlusIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/app/query-state';
import { TaskSummary } from '@/components/app/tasks/task-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api/errors';
import type { BoardColumn, Task, TaskStatus } from '@/lib/api/types';
import { findTask, isSamePlacement, placementFor, STATUS_LABELS } from '@/lib/board';
import { useBoard, useCreateTask, useMoveTask } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface KanbanBoardProps {
  orgId: string;
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

export function KanbanBoard({ orgId, projectId, onOpenTask }: KanbanBoardProps) {
  const { data: board, error, isPending, refetch } = useBoard(orgId, projectId);
  const move = useMoveTask(orgId, projectId);
  const [activeId, setActiveId] = useState<string | null>(null);

  // A small distance before a drag starts keeps plain clicks working. The keyboard sensor lets
  // people lift a card with Space, move it with the arrow keys and drop it with Space again.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending) {
    return <Skeleton className="h-96 w-full" aria-busy="true" aria-label="Loading board" />;
  }
  if (error) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  const activeTask = activeId ? findTask(board, activeId) : undefined;

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!event.over) return;
    const taskId = String(event.active.id);
    const placement = placementFor(board, taskId, String(event.over.id));
    if (!placement || isSamePlacement(board, taskId, placement)) return;

    move.mutate(
      { taskId, ...placement },
      { onError: (moveError) => toast.error(errorMessage(moveError, 'Could not move the task')) },
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {board.columns.map((column) => (
          <Column
            key={column.status}
            column={column}
            orgId={orgId}
            projectId={projectId}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="rounded-lg border bg-card p-3 shadow-lg">
            <TaskSummary task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface ColumnProps {
  column: BoardColumn;
  orgId: string;
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

function Column({ column, orgId, projectId, onOpenTask }: ColumnProps) {
  // The column itself is a drop target so a card can be dropped into an empty column.
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <section
      aria-label={`${STATUS_LABELS[column.status]}, ${column.tasks.length} tasks`}
      className={cn(
        'flex min-h-48 flex-col gap-3 rounded-xl bg-muted/50 p-3 transition-colors',
        isOver && 'bg-muted',
      )}
    >
      <header className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{STATUS_LABELS[column.status]}</h2>
        <span className="text-xs text-muted-foreground">
          {column.tasks.length}
          {column.hasMore && '+'}
        </span>
      </header>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2">
        <SortableContext
          items={column.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <SortableCard key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
          ))}
        </SortableContext>
        {column.hasMore && (
          <p className="px-1 text-xs text-muted-foreground">
            Showing the first {column.tasks.length} tasks. Use the list view to see the rest.
          </p>
        )}
      </div>
      <AddTask orgId={orgId} projectId={projectId} status={column.status} />
    </section>
  );
}

function SortableCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-start gap-1 rounded-lg border bg-card p-2 shadow-xs',
        isDragging && 'opacity-40',
      )}
    >
      {/* Dragging has its own handle so the rest of the card stays a plain button that opens the
          task, and Enter/Space on it do not start a drag by accident. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Move "${task.title}". Press space to pick up, arrow keys to move, space to drop.`}
        className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded p-0.5 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <TaskSummary task={task} />
      </button>
    </div>
  );
}

function AddTask({
  orgId,
  projectId,
  status,
}: {
  orgId: string;
  projectId: string;
  status: TaskStatus;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useCreateTask(orgId, projectId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed, status },
      {
        onSuccess: () => {
          setTitle('');
          setOpen(false);
        },
        onError: (createError) => toast.error(errorMessage(createError, 'Could not add the task')),
      },
    );
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="justify-start" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        Add task
      </Button>
    );
  }
  return (
    <form method="post" onSubmit={submit} className="grid gap-2">
      <Input
        autoFocus
        aria-label={`Title of the new task in ${STATUS_LABELS[status]}`}
        placeholder="What needs to be done?"
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending || !title.trim()}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
