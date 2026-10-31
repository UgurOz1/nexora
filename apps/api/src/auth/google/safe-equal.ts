import { timingSafeEqual } from 'node:crypto';

// Constant-time string comparison, so response timing cannot be used to guess a secret byte by byte.
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
