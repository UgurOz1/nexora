import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor, toPage } from './cursor';

const cursor = { value: '2026-11-01T10:00:00.000Z', id: 'task-1' };

describe('cursor', () => {
  it('round-trips', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['not base64 json', 'hello'],
    ['empty', ''],
    ['wrong shape', Buffer.from('{"a":1}').toString('base64url')],
    ['bad date', Buffer.from('{"value":"nope","id":"x"}').toString('base64url')],
    ['non-string id', Buffer.from('{"value":"2026-01-01T00:00:00Z","id":5}').toString('base64url')],
  ])('rejects %s', (_label, raw) => {
    expect(() => decodeCursor(raw)).toThrow(BadRequestException);
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3, 4].map((n) => ({ id: `r${n}`, at: `2026-11-0${n}T00:00:00.000Z` }));
  const cursorOf = (row: (typeof rows)[number]) => ({ value: row.at, id: row.id });

  it('returns a next cursor pointing at the last returned row when more rows exist', () => {
    const page = toPage(rows, 3, cursorOf);

    expect(page.items.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(decodeCursor(page.nextCursor!)).toEqual({ value: rows[2].at, id: 'r3' });
  });

  it('has no next cursor on the last page', () => {
    expect(toPage(rows, 4, cursorOf)).toEqual({ items: rows, nextCursor: null });
    expect(toPage([], 3, cursorOf)).toEqual({ items: [], nextCursor: null });
  });
});
