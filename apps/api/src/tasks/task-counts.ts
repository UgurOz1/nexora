import { TaskStatus } from '../generated/prisma/client';
import type { TenantTx } from '../prisma/tenant-scope';

type Db = Pick<TenantTx, 'task' | 'taskDependency'>;

export interface TaskCounts {
  subtaskCount: number;
  // Waits for at least one task that exists and is not DONE yet.
  isBlocked: boolean;
}

// Adds subtaskCount and isBlocked to tasks with two small queries limited to these tasks' ids.
//
// Not Prisma's `_count` in the select: for that, Prisma counts the subtasks of EVERY task in the
// table (a GROUP BY over the whole table joined to the result), which on a million tasks took
// ~300 ms even for a list of 20. These queries read only the rows of the tasks asked for, through
// the parentId and taskId indexes. (Found with the k6 load test; docs/PERFORMANCE.md.)
export async function withCounts<T extends { id: string }>(
  db: Db,
  tasks: T[],
): Promise<(T & TaskCounts)[]> {
  if (tasks.length === 0) return [];
  const ids = tasks.map((task) => task.id);
  const [subtasks, blockers] = await Promise.all([
    db.task.groupBy({
      by: ['parentId'],
      where: { parentId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    db.taskDependency.groupBy({
      by: ['taskId'],
      where: {
        taskId: { in: ids },
        dependsOn: { deletedAt: null, status: { not: TaskStatus.DONE } },
      },
      _count: { _all: true },
    }),
  ]);
  const subtaskCount = new Map(subtasks.map((row) => [row.parentId, row._count._all]));
  const blocked = new Set(blockers.map((row) => row.taskId));
  return tasks.map((task) => ({
    ...task,
    subtaskCount: subtaskCount.get(task.id) ?? 0,
    isBlocked: blocked.has(task.id),
  }));
}

export async function withCount<T extends { id: string }>(
  db: Db,
  task: T,
): Promise<T & TaskCounts> {
  const [counted] = await withCounts(db, [task]);
  return counted;
}
