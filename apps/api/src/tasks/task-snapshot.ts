import type { TaskPriority, TaskStatus } from '../generated/prisma/client';

// The fields whose history we keep. Everything is stored as plain JSON values (dates as ISO
// strings) so a snapshot can be saved, read back and compared without any conversion.
export interface TaskSnapshot {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  labels: string[];
  assigneeId: string | null;
}

export interface FieldChange {
  from: unknown;
  to: unknown;
}

// field name -> what it was and what it became
export type Changes = Record<string, FieldChange>;

const FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'labels',
  'assigneeId',
] as const satisfies readonly (keyof TaskSnapshot)[];

interface TaskLike {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  labels: string[];
  assigneeId: string | null;
}

export function snapshotOf(task: TaskLike): TaskSnapshot {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    labels: [...task.labels],
    assigneeId: task.assigneeId,
  };
}

// Labels are a set: reordering them is not a change.
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const left = [...(a as string[])].sort();
    const right = [...(b as string[])].sort();
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  return a === b;
}

// What changed between two versions. `before` is null for a brand-new task, so every field
// that has a value counts as changed from nothing.
export function diffSnapshots(before: TaskSnapshot | null, after: TaskSnapshot): Changes {
  const changes: Changes = {};
  for (const field of FIELDS) {
    const from = before ? before[field] : null;
    const to = after[field];
    const bothEmpty = !before && (to === null || (Array.isArray(to) && to.length === 0));
    if (!bothEmpty && !sameValue(from, to)) {
      changes[field] = { from, to };
    }
  }
  return changes;
}
