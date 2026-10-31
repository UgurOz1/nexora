import { randomBytes } from 'node:crypto';

// Sort key that places a new task at the end of its column. It is a placeholder: week 8 replaces
// it with fractional indexing so tasks can be dragged between any two others in the Kanban board.
export function newPosition(now: number = Date.now()): string {
  return now.toString(36).padStart(10, '0') + randomBytes(2).toString('hex');
}
