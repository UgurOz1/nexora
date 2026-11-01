import type { Board, Task, TaskPriority, TaskStatus } from './api/types';

export const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};

export const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export interface Placement {
  status: TaskStatus;
  // The card the dragged task goes right after; null = top of the column.
  afterId: string | null;
}

export function findTask(board: Board, taskId: string): Task | undefined {
  for (const column of board.columns) {
    const task = column.tasks.find((t) => t.id === taskId);
    if (task) return task;
  }
  return undefined;
}

// Returns a copy of the board with the task moved, the same way the server will place it. This is
// the "optimistic" half of a drag: the card jumps at once while the request is on its way, and if
// the server refuses, the previous board (kept by the caller) is put back.
export function moveInBoard(board: Board, taskId: string, to: Placement): Board {
  const task = findTask(board, taskId);
  if (!task) return board;

  // An unknown afterId means our picture is stale: leave the card where it is and let the refetch
  // after the request sort it out.
  const target = board.columns.find((c) => c.status === to.status);
  if (to.afterId !== null && !target?.tasks.some((t) => t.id === to.afterId && t.id !== taskId)) {
    return board;
  }

  return {
    ...board,
    columns: board.columns.map((column) => {
      const without = column.tasks.filter((t) => t.id !== taskId);
      if (column.status !== to.status) {
        return without.length === column.tasks.length ? column : { ...column, tasks: without };
      }
      const index = to.afterId === null ? 0 : without.findIndex((t) => t.id === to.afterId) + 1;
      const next = [...without];
      next.splice(index, 0, { ...task, status: to.status });
      return { ...column, tasks: next };
    }),
  };
}

// Turns "dropped on `overId`" into a placement. `overId` is either a card or an (empty) column.
export function placementFor(board: Board, taskId: string, overId: string): Placement | undefined {
  const overColumn = board.columns.find((c) => c.status === overId);
  if (overColumn) {
    // Dropped on the column itself (the empty area): put it at the bottom.
    const last = [...overColumn.tasks].reverse().find((t) => t.id !== taskId);
    return { status: overColumn.status, afterId: last?.id ?? null };
  }

  for (const column of board.columns) {
    const index = column.tasks.findIndex((t) => t.id === overId);
    if (index === -1) continue;
    if (overId === taskId) return undefined;

    const source = findTask(board, taskId);
    const sameColumn = source?.status === column.status;
    const sourceIndex = column.tasks.findIndex((t) => t.id === taskId);
    // Moving down inside a column lands after the card we are over; moving up lands before it.
    const movingDown = sameColumn && sourceIndex < index;
    if (movingDown) return { status: column.status, afterId: overId };

    const before = column.tasks.slice(0, index).filter((t) => t.id !== taskId);
    return { status: column.status, afterId: before[before.length - 1]?.id ?? null };
  }
  return undefined;
}

export function isSamePlacement(board: Board, taskId: string, to: Placement): boolean {
  const moved = moveInBoard(board, taskId, to);
  return board.columns.every((column, i) => {
    const other = moved.columns[i]!;
    return (
      column.tasks.length === other.tasks.length &&
      column.tasks.every((t, j) => t.id === other.tasks[j]!.id)
    );
  });
}
