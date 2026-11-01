'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState } from '@/components/app/query-state';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api/errors';
import type { HistoryEvent, TaskDetail, TaskPriority, TaskStatus } from '@/lib/api/types';
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, STATUSES } from '@/lib/board';
import {
  useAddDependency,
  useCreateSubtask,
  useDeleteTask,
  useMe,
  useMembers,
  useRemoveDependency,
  useTask,
  useTaskHistory,
  useTaskList,
  useUpdateTask,
} from '@/lib/queries';
import { hasAtLeast } from '@/lib/roles';
import type { Role } from '@/lib/api/types';

interface TaskDialogProps {
  orgId: string;
  projectId: string;
  role: Role | undefined;
  taskId: string | null;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}

export function TaskDialog({
  orgId,
  projectId,
  role,
  taskId,
  onClose,
  onOpenTask,
}: TaskDialogProps) {
  const { data: task, error, isPending, refetch } = useTask(orgId, taskId);

  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {taskId && isPending && (
          <>
            <DialogHeader>
              <DialogTitle>Loading task…</DialogTitle>
              <DialogDescription>One moment.</DialogDescription>
            </DialogHeader>
            <Skeleton className="h-48 w-full" aria-busy="true" aria-label="Loading" />
          </>
        )}
        {taskId && error && (
          <>
            <DialogHeader>
              <DialogTitle>Task unavailable</DialogTitle>
              <DialogDescription>It may have been deleted.</DialogDescription>
            </DialogHeader>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </>
        )}
        {task && (
          <TaskBody
            key={task.id}
            orgId={orgId}
            projectId={projectId}
            role={role}
            task={task}
            onClose={onClose}
            onOpenTask={onOpenTask}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const detailsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200, 'Use at most 200 characters'),
  description: z.string().max(5000, 'Use at most 5000 characters'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  dueDate: z.string(),
  assigneeId: z.string(),
});
type DetailsValues = z.infer<typeof detailsSchema>;

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function TaskBody({
  orgId,
  projectId,
  role,
  task,
  onClose,
  onOpenTask,
}: Omit<TaskDialogProps, 'taskId'> & { task: TaskDetail }) {
  const { data: me } = useMe();
  const { data: members } = useMembers(orgId);
  const update = useUpdateTask(orgId, projectId, task.id);
  const remove = useDeleteTask(orgId, projectId, task.id);
  const [formError, setFormError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const defaults: DetailsValues = {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    dueDate: toDateInput(task.dueDate),
    assigneeId: task.assigneeId ?? '',
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<DetailsValues>({ resolver: zodResolver(detailsSchema), defaultValues: defaults });

  // The board may change the task (a drag changes its status) while this dialog is open.
  useEffect(() => {
    if (!isDirty) reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.updatedAt]);

  // Same rule as the API: anyone may delete their own task, managers and above may delete any.
  const canDelete = hasAtLeast(role, 'MANAGER') || task.createdBy.id === me?.id;

  const save = handleSubmit((values) => {
    setFormError(undefined);
    update.mutate(
      {
        title: values.title,
        description: values.description || null,
        status: values.status,
        priority: values.priority,
        dueDate: values.dueDate ? `${values.dueDate}T00:00:00.000Z` : null,
        assigneeId: values.assigneeId || null,
      },
      {
        onSuccess: () => toast.success('Task saved'),
        onError: (saveError) => setFormError(errorMessage(saveError)),
      },
    );
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{task.title}</DialogTitle>
        <DialogDescription>
          {task.parentId ? 'Subtask · ' : ''}Created by {task.createdBy.name}
          {task.isBlocked && ' · waiting for another task'}
        </DialogDescription>
      </DialogHeader>

      <form method="post" onSubmit={(event) => void save(event)} noValidate className="grid gap-4">
        <FormError message={formError} />
        <FormField id="task-title" label="Title" error={errors.title?.message}>
          <Input
            id="task-title"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'task-title-error' : undefined}
            {...register('title')}
          />
        </FormField>
        <FormField id="task-description" label="Description" error={errors.description?.message}>
          <Textarea id="task-description" rows={4} {...register('description')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="task-status" label="Status">
            <NativeSelect id="task-status" {...register('status')}>
              {STATUSES.map((s: TaskStatus) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="task-priority" label="Priority">
            <NativeSelect id="task-priority" {...register('priority')}>
              {PRIORITIES.map((p: TaskPriority) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="task-assignee" label="Assignee">
            <NativeSelect id="task-assignee" {...register('assigneeId')}>
              <option value="">Unassigned</option>
              {members?.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="task-due" label="Due date">
            <Input id="task-due" type="date" {...register('dueDate')} />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="submit" disabled={update.isPending || !isDirty}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {canDelete &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                Delete this task?
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(undefined, {
                      onSuccess: () => {
                        toast.success('Task deleted');
                        onClose();
                      },
                      onError: (deleteError) => toast.error(errorMessage(deleteError)),
                    })
                  }
                >
                  Yes, delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ))}
        </div>
      </form>

      {!task.parentId && (
        <Subtasks orgId={orgId} projectId={projectId} task={task} onOpenTask={onOpenTask} />
      )}
      <Dependencies orgId={orgId} projectId={projectId} task={task} onOpenTask={onOpenTask} />
      <History orgId={orgId} task={task} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Subtasks({
  orgId,
  projectId,
  task,
  onOpenTask,
}: {
  orgId: string;
  projectId: string;
  task: TaskDetail;
  onOpenTask: (taskId: string) => void;
}) {
  const create = useCreateSubtask(orgId, projectId, task.id);
  const [title, setTitle] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(trimmed, {
      onSuccess: () => setTitle(''),
      onError: (createError) => toast.error(errorMessage(createError)),
    });
  };

  return (
    <Section title={`Subtasks (${task.subtasks.length})`}>
      {task.subtasks.length > 0 && (
        <ul className="grid gap-1">
          {task.subtasks.map((sub) => (
            <li key={sub.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="truncate text-left hover:underline"
                onClick={() => onOpenTask(sub.id)}
              >
                {sub.title}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                {STATUS_LABELS[sub.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form method="post" onSubmit={submit} className="flex gap-2">
        <Input
          aria-label="New subtask title"
          placeholder="Add a subtask"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={create.isPending || !title.trim()}>
          Add
        </Button>
      </form>
    </Section>
  );
}

function Dependencies({
  orgId,
  projectId,
  task,
  onOpenTask,
}: {
  orgId: string;
  projectId: string;
  task: TaskDetail;
  onOpenTask: (taskId: string) => void;
}) {
  const add = useAddDependency(orgId, projectId, task.id);
  const remove = useRemoveDependency(orgId, projectId, task.id);
  const { data: candidates } = useTaskList(orgId, projectId, {});
  const [choice, setChoice] = useState('');

  const taken = new Set([task.id, ...task.blockedBy.map((b) => b.id)]);
  const options = candidates?.items.filter((t) => !taken.has(t.id) && t.parentId === null) ?? [];

  return (
    <Section title="Dependencies">
      <p className="text-xs text-muted-foreground">
        This task cannot leave &quot;To do&quot; until everything it waits for is done.
      </p>
      {task.blockedBy.length > 0 ? (
        <ul className="grid gap-1">
          {task.blockedBy.map((dep) => (
            <li key={dep.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="truncate text-left hover:underline"
                onClick={() => onOpenTask(dep.id)}
              >
                Waits for: {dep.title}
              </button>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{STATUS_LABELS[dep.status]}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Stop waiting for ${dep.title}`}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(dep.id, { onError: (e) => toast.error(errorMessage(e)) })
                  }
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">This task does not wait for anything.</p>
      )}
      {task.blocks.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Blocks: {task.blocks.map((b) => b.title).join(', ')}
        </p>
      )}
      {options.length > 0 && (
        <form
          method="post"
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!choice) return;
            add.mutate(choice, {
              onSuccess: () => setChoice(''),
              onError: (e) => toast.error(errorMessage(e)),
            });
          }}
        >
          <NativeSelect
            aria-label="Task to wait for"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">Wait for another task…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="outline" disabled={add.isPending || !choice}>
            Add
          </Button>
        </form>
      )}
    </Section>
  );
}

const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

function describe(event: HistoryEvent): string {
  if (event.type === 'CREATED') return 'created the task';
  if (event.type === 'DELETED') return 'deleted the task';
  const fields = Object.keys(event.changes);
  return fields.length > 0 ? `changed ${fields.join(', ')}` : 'updated the task';
}

function History({ orgId, task }: { orgId: string; task: TaskDetail }) {
  // The history is refetched whenever the task changes (its updatedAt moves).
  const { data, error } = useTaskHistory(orgId, task.id);

  return (
    <Section title="History">
      {error && <p className="text-sm text-destructive">Could not load the history.</p>}
      {data && (
        <ul className="grid gap-1 text-sm">
          {data.items.map((event) => (
            <li key={event.id} className="flex justify-between gap-2">
              <span>
                <span className="font-medium">{event.actor?.name ?? 'Someone'}</span>{' '}
                {describe(event)}
              </span>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.createdAt}>
                {time.format(new Date(event.createdAt))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
