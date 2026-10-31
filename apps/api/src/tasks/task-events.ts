import { Prisma, type TaskEventType } from '../generated/prisma/client';
import type { TenantTx } from '../prisma/tenant-scope';
import type { Changes, TaskSnapshot } from './task-snapshot';

export interface TaskEventInput {
  organizationId: string;
  taskId: string;
  // null when the system acted on its own (a recurring task being generated)
  actorId: string | null;
  type: TaskEventType;
  changes: Changes;
  snapshot: TaskSnapshot;
}

const toData = (event: TaskEventInput) => ({
  organizationId: event.organizationId,
  taskId: event.taskId,
  actorId: event.actorId,
  type: event.type,
  changes: event.changes as unknown as Prisma.InputJsonObject,
  snapshot: event.snapshot as unknown as Prisma.InputJsonObject,
});

// Always called with the transaction of the change it describes: the change and its history
// entry are saved together or not at all.
export function recordEvent(tx: Pick<TenantTx, 'taskEvent'>, event: TaskEventInput) {
  return tx.taskEvent.create({ data: toData(event) });
}

export function recordEvents(tx: Pick<TenantTx, 'taskEvent'>, events: TaskEventInput[]) {
  return tx.taskEvent.createMany({ data: events.map(toData) });
}
