// Fractional indexing: sort keys that always leave room between two neighbours.
//
// Numbering cards 1, 2, 3 would force a rewrite of every card below a drop point. Instead each
// card gets a string and a card dropped between two others gets a string that sorts between
// theirs; no other card changes. Think of a key as the digits after a decimal point in base 36
// ("i" = 0.i, "i5" = 0.i5): comparing keys as strings is comparing those numbers, and there is
// always another number between two different ones.
//
// The alphabet is deliberately lowercase digits and letters only. The database sorts these
// strings itself (ORDER BY position), and with such an alphabet its collation rules agree with a
// plain character-by-character comparison; with upper case or punctuation they would not.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;
const LAST = ALPHABET[BASE - 1];

// Keys longer than this are a sign of an unlucky insertion pattern; the column is renumbered.
export const MAX_KEY_LENGTH = 32;

export class InvalidOrderKeyError extends Error {}

const digit = (char: string | undefined): number =>
  char === undefined ? 0 : ALPHABET.indexOf(char);

// Canonical keys are non-empty, use only the alphabet and do not end in "0" (a trailing zero adds
// nothing numerically, so two different strings could mean the same number).
export function isValidKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    !key.endsWith('0') &&
    [...key].every((c) => digit(c) >= 0)
  );
}

// A key strictly between a and b, where a may be '' (zero) and b null (one).
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // Shared leading digits stay as they are; a missing digit of `a` counts as 0.
    let shared = 0;
    while ((a[shared] ?? '0') === b[shared]) {
      shared++;
    }
    if (shared > 0) {
      return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
    }
  }

  const low = digit(a[0]);
  const high = b !== null ? digit(b[0]) : BASE;
  if (high - low > 1) {
    return ALPHABET[Math.round((low + high) / 2)];
  }
  // The first digits are neighbours: no digit fits between them.
  if (b !== null && b.length > 1) {
    return b.slice(0, 1); // b without its tail is smaller than b and larger than a
  }
  return ALPHABET[low] + midpoint(a.slice(1), null);
}

// Just after `a`: the cheap case for "add to the end". Stepping one digit up (instead of halving
// the remaining space) keeps keys short when cards are appended one after the other.
function after(a: string): string {
  const first = digit(a[0]);
  return a[0] === LAST ? LAST + after(a.slice(1) || '0') : ALPHABET[first + 1];
}

// A key that sorts after `a` and before `b`. `a` null means "at the start", `b` null "at the end".
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && !isValidKey(a)) {
    throw new InvalidOrderKeyError(`Invalid order key: ${a}`);
  }
  if (b !== null && !isValidKey(b)) {
    throw new InvalidOrderKeyError(`Invalid order key: ${b}`);
  }
  if (a !== null && b !== null && a >= b) {
    throw new InvalidOrderKeyError(`${a} must sort before ${b}`);
  }

  if (a === null && b === null) {
    return ALPHABET[BASE / 2];
  }
  if (b === null) {
    return after(a!);
  }
  return midpoint(a ?? '', b);
}

// `count` increasing keys, used to renumber a column from scratch.
export function freshKeys(count: number): string[] {
  const keys: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < count; i++) {
    previous = keyBetween(previous, null);
    keys.push(previous);
  }
  return keys;
}
