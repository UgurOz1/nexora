import { describe, expect, it } from 'vitest';
import type { Board, Task, TaskStatus } from './api/types';
import { isSamePlacement, moveInBoard, placementFor } from './board';

function task(id: string, status: TaskStatus): Task {
  return {
    id,
    title: id,
    status,
    priority: 'MEDIUM',
    projectId: 'p',
    parentId: null,
    description: null,
    dueDate: null,
    labels: [],
    assigneeId: null,
    position: id,
    recurringTaskId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assignee: null,
    createdBy: { id: 'u', name: 'U' },
    subtaskCount: 0,
    isBlocked: false,
  };
}

function boardOf(columns: Record<TaskStatus, string[]>): Board {
  return {
    columns: (Object.keys(columns) as TaskStatus[]).map((status) => ({
      status,
      hasMore: false,
      tasks: columns[status].map((id) => task(id, status)),
    })),
  };
}

const ids = (board: Board, status: TaskStatus) =>
  board.columns.find((c) => c.status === status)!.tasks.map((t) => t.id);

const start = () =>
  boardOf({ TODO: ['a', 'b', 'c'], IN_PROGRESS: ['d'], IN_REVIEW: [], DONE: ['e'] });

describe('moveInBoard', () => {
  it('reorders inside a column', () => {
    expect(ids(moveInBoard(start(), 'c', { status: 'TODO', afterId: 'a' }), 'TODO')).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(ids(moveInBoard(start(), 'c', { status: 'TODO', afterId: null }), 'TODO')).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(ids(moveInBoard(start(), 'a', { status: 'TODO', afterId: 'c' }), 'TODO')).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('moves to another column and updates the status', () => {
    const moved = moveInBoard(start(), 'a', { status: 'IN_PROGRESS', afterId: 'd' });

    expect(ids(moved, 'TODO')).toEqual(['b', 'c']);
    expect(ids(moved, 'IN_PROGRESS')).toEqual(['d', 'a']);
    expect(moved.columns[1]!.tasks[1]!.status).toBe('IN_PROGRESS');
  });

  it('moves into an empty column', () => {
    expect(
      ids(moveInBoard(start(), 'a', { status: 'IN_REVIEW', afterId: null }), 'IN_REVIEW'),
    ).toEqual(['a']);
  });

  it('does not change the original board', () => {
    const board = start();
    moveInBoard(board, 'a', { status: 'DONE', afterId: null });
    expect(ids(board, 'TODO')).toEqual(['a', 'b', 'c']);
  });

  it('leaves the board alone for an unknown task or an unknown neighbour', () => {
    const board = start();
    expect(moveInBoard(board, 'zzz', { status: 'TODO', afterId: null })).toBe(board);
    expect(ids(moveInBoard(board, 'a', { status: 'DONE', afterId: 'nope' }), 'TODO')).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('placementFor', () => {
  it('drops on a lower card in the same column: after it', () => {
    expect(placementFor(start(), 'a', 'c')).toEqual({ status: 'TODO', afterId: 'c' });
  });

  it('drops on a higher card in the same column: before it', () => {
    expect(placementFor(start(), 'c', 'b')).toEqual({ status: 'TODO', afterId: 'a' });
    expect(placementFor(start(), 'c', 'a')).toEqual({ status: 'TODO', afterId: null });
  });

  it('drops on a card of another column: before it', () => {
    expect(placementFor(start(), 'a', 'e')).toEqual({ status: 'DONE', afterId: null });
  });

  it('drops on a column: at the bottom', () => {
    expect(placementFor(start(), 'a', 'DONE')).toEqual({ status: 'DONE', afterId: 'e' });
    expect(placementFor(start(), 'a', 'IN_REVIEW')).toEqual({ status: 'IN_REVIEW', afterId: null });
    expect(placementFor(start(), 'a', 'TODO')).toEqual({ status: 'TODO', afterId: 'c' });
  });

  it('ignores a drop on itself or on nothing', () => {
    expect(placementFor(start(), 'a', 'a')).toBeUndefined();
    expect(placementFor(start(), 'a', 'ghost')).toBeUndefined();
  });
});

describe('isSamePlacement', () => {
  it('spots drops that change nothing', () => {
    expect(isSamePlacement(start(), 'b', { status: 'TODO', afterId: 'a' })).toBe(true);
    expect(isSamePlacement(start(), 'c', { status: 'TODO', afterId: 'b' })).toBe(true);
    expect(isSamePlacement(start(), 'a', { status: 'TODO', afterId: null })).toBe(true);
    expect(isSamePlacement(start(), 'b', { status: 'TODO', afterId: null })).toBe(false);
  });
});
