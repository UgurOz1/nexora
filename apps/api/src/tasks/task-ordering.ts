import { BadRequestException } from '@nestjs/common';
import type { Prisma, TaskStatus } from '../generated/prisma/client';
import type { TenantTx } from '../prisma/tenant-scope';
import { freshKeys, InvalidOrderKeyError, isValidKey, keyBetween } from './order-key';

type Db = Pick<TenantTx, 'task'>;

// A "column" is the list a task is ordered in: the tasks of one project with one status. Subtasks
// are ordered among their siblings (same parent) and never appear on the board.
export interface Column {
  projectId: string;
  status: TaskStatus;
  parentId: string | null;
}

const inColumn = (column: Column): Prisma.TaskWhereInput => ({
  projectId: column.projectId,
  status: column.status,
  parentId: column.parentId,
  deletedAt: null,
});

// Gives every task of the column a fresh, evenly spread key, keeping their current order. The
// escape hatch for keys that are unusable (old formats, two cards that ended up with the same
// key after a race, keys that grew too long).
export async function rebalanceColumn(tx: Db, column: Column): Promise<void> {
  const tasks = await tx.task.findMany({
    where: inColumn(column),
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const keys = freshKeys(tasks.length);
  for (const [index, task] of tasks.entries()) {
    await tx.task.update({ where: { id: task.id }, data: { position: keys[index] } });
  }
}

// The key for a task added at the bottom of a column.
export async function endPosition(tx: Db, column: Column): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const last = await tx.task.findFirst({
      where: inColumn(column),
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });
    if (!last) {
      return keyBetween(null, null);
    }
    if (isValidKey(last.position)) {
      return keyBetween(last.position, null);
    }
    await rebalanceColumn(tx, column);
  }
  throw new Error('Could not find a usable position at the end of the column');
}

// The key for `movingId` placed right after `afterId` (null = at the top of the column). The
// client only says WHERE; the server works out the key from what is in the database right now,
// so a client with a stale picture of the board cannot produce a wrong or duplicate key.
export async function positionAfter(
  tx: Db,
  column: Column,
  movingId: string,
  afterId: string | null,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const after = afterId
      ? await tx.task.findFirst({
          where: { ...inColumn(column), id: afterId, NOT: { id: movingId } },
          select: { id: true, position: true },
        })
      : null;
    if (afterId && !after) {
      throw new BadRequestException('afterId must be another task in the target column');
    }

    // The task that currently follows `after` (or the first of the column), without the moving
    // task itself, which is about to leave its old place.
    const next = await tx.task.findFirst({
      where: {
        ...inColumn(column),
        NOT: { id: movingId },
        ...(after && {
          OR: [
            { position: { gt: after.position } },
            { position: after.position, id: { gt: after.id } },
          ],
        }),
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { position: true },
    });

    try {
      return keyBetween(after?.position ?? null, next?.position ?? null);
    } catch (error) {
      if (error instanceof InvalidOrderKeyError && attempt === 0) {
        await rebalanceColumn(tx, column);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Could not find a usable position');
}
