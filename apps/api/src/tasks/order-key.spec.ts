import {
  freshKeys,
  InvalidOrderKeyError,
  isValidKey,
  keyBetween,
  MAX_KEY_LENGTH,
} from './order-key';

// Small deterministic random generator, so a failing run can be reproduced.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('keyBetween', () => {
  it('gives the first key of an empty column', () => {
    expect(keyBetween(null, null)).toBe('i');
  });

  it('adds to the end by stepping up, so keys stay short', () => {
    let key = keyBetween(null, null);
    const keys = [key];
    for (let i = 0; i < 17; i++) {
      key = keyBetween(key, null);
      keys.push(key);
    }

    expect(keys.slice(0, 4)).toEqual(['i', 'j', 'k', 'l']);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(2);
    expect([...keys].sort()).toEqual(keys);
  });

  it('adds to the start', () => {
    expect(keyBetween(null, 'i') < 'i').toBe(true);
    expect(isValidKey(keyBetween(null, 'i'))).toBe(true);
  });

  it('puts a key between two neighbours, also when their first digits are adjacent', () => {
    expect(keyBetween('a', 'c')).toBe('b');
    const between = keyBetween('a', 'b');
    expect('a' < between && between < 'b').toBe(true);
    const deep = keyBetween('a1', 'a2');
    expect('a1' < deep && deep < 'a2').toBe(true);
  });

  it('handles a lower neighbour that is a prefix of the upper one', () => {
    const key = keyBetween('a', 'a0b'); // "a" is the same number as "a0"
    expect('a' < key && key < 'a0b').toBe(true);
    expect(isValidKey(key)).toBe(true);
  });

  it('refuses invalid or misordered input', () => {
    expect(() => keyBetween('b', 'a')).toThrow(InvalidOrderKeyError);
    expect(() => keyBetween('a', 'a')).toThrow(InvalidOrderKeyError);
    expect(() => keyBetween('a0', null)).toThrow(InvalidOrderKeyError); // trailing zero
    expect(() => keyBetween('A', null)).toThrow(InvalidOrderKeyError); // upper case
    expect(() => keyBetween('', null)).toThrow(InvalidOrderKeyError);
  });

  it('survives thousands of random insertions: always strictly ordered, always valid', () => {
    const next = random(42);
    const column: string[] = [];

    for (let step = 0; step < 5000; step++) {
      const index = Math.floor(next() * (column.length + 1));
      const key = keyBetween(column[index - 1] ?? null, column[index] ?? null);
      expect(isValidKey(key)).toBe(true);
      column.splice(index, 0, key);
    }

    for (let i = 1; i < column.length; i++) {
      expect(column[i - 1] < column[i]).toBe(true);
    }
  });

  it('keeps keys short when always inserting at the same spot (the worst case)', () => {
    // Dragging cards onto the same slot over and over halves the gap each time.
    let upper = 'j';
    for (let i = 0; i < 100; i++) {
      upper = keyBetween('i', upper);
    }

    expect(isValidKey('i') && 'i' < upper).toBe(true);
    // Growth is linear (about a digit per 5 insertions), and the service renumbers long keys.
    expect(upper.length).toBeLessThan(MAX_KEY_LENGTH + 10);
  });
});

describe('freshKeys', () => {
  it('produces increasing valid keys for renumbering a column', () => {
    const keys = freshKeys(500);

    expect(keys).toHaveLength(500);
    expect(keys.every(isValidKey)).toBe(true);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(500);
  });

  it('returns nothing for an empty column', () => {
    expect(freshKeys(0)).toEqual([]);
  });
});

describe('isValidKey', () => {
  it.each([
    ['i', true],
    ['a1', true],
    ['zzz9', true],
    ['', false],
    ['a0', false],
    ['I', false],
    ['a-b', false],
    ['a'.repeat(MAX_KEY_LENGTH + 1), false],
  ])('%s -> %s', (key, expected) => {
    expect(isValidKey(key)).toBe(expected);
  });
});
