import { BadRequestException } from '@nestjs/common';

// A cursor says "continue after this row". It carries the sort value and the id of the last row
// of the previous page; the id breaks ties between rows that share the same sort value.
export interface Cursor {
  value: string;
  id: string;
}

export interface Page<T> {
  items: T[];
  // Pass this back as `cursor` to get the next page; null when there are no more rows.
  nextCursor: string | null;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Opaque to clients on purpose: they must not build cursors themselves, so the format can change.
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (
      typeof parsed.value === 'string' &&
      typeof parsed.id === 'string' &&
      !Number.isNaN(Date.parse(parsed.value))
    ) {
      return { value: parsed.value, id: parsed.id };
    }
  } catch {
    // falls through to the error below
  }
  throw new BadRequestException('Invalid cursor');
}

// Fetch one row more than the page size: if it exists there is a next page, and the extra row
// is dropped. Cheaper than a separate COUNT query and never wrong when rows change meanwhile.
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? encodeCursor(cursorOf(items[items.length - 1])) : null,
  };
}
