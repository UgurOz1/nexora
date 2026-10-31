import { safeEqual } from './safe-equal';

describe('safeEqual', () => {
  it('accepts identical strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects different strings, including ones of different length', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc', 'abc123')).toBe(false);
  });

  it('rejects missing values, so a missing cookie never matches a missing query param', () => {
    expect(safeEqual(undefined, undefined)).toBe(false);
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual('abc', undefined)).toBe(false);
  });
});
