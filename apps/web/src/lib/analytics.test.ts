import { describe, expect, it } from 'vitest';
import { formatDay, formatDuration, niceTicks, separateLabels, share } from './analytics';

describe('formatDuration', () => {
  it('uses hours below two days and days above, and a dash for none', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(4.26)).toBe('4.3 h');
    expect(formatDuration(30)).toBe('30 h');
    expect(formatDuration(72)).toBe('3.0 d');
  });
});

describe('formatDay', () => {
  it('formats the UTC day without shifting it', () => {
    expect(formatDay('2026-11-09')).toBe('Nov 9');
    expect(formatDay('2027-01-01')).toBe('Jan 1');
  });
});

describe('niceTicks', () => {
  it('rounds the top up to a readable step', () => {
    expect(niceTicks(17)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(1300)).toEqual([0, 500, 1000, 1500]);
  });

  it('still has an axis when everything is zero', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('share', () => {
  it('is a whole percentage, and 0 of nothing', () => {
    expect(share(1, 3)).toBe(33);
    expect(share(0, 0)).toBe(0);
  });
});

describe('separateLabels', () => {
  it('leaves labels that are far enough apart', () => {
    expect(separateLabels(10, 50, 14)).toEqual([10, 50]);
  });

  it('pushes close labels apart around their middle, keeping their order', () => {
    expect(separateLabels(100, 104, 14)).toEqual([95, 109]);
    expect(separateLabels(104, 100, 14)).toEqual([109, 95]);
  });
});
