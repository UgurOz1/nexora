import {
  firstOccurrenceFrom,
  InvalidRecurrenceError,
  occurrenceAfter,
  parseRule,
  upcomingOccurrences,
} from './recurrence';

const iso = (dates: (Date | null)[]) => dates.map((d) => d?.toISOString() ?? null);

// 2026-11-02 is a Monday.
const monday = new Date('2026-11-02T09:00:00.000Z');

describe('parseRule', () => {
  it.each([
    'FREQ=DAILY',
    'FREQ=WEEKLY;BYDAY=MO,TH',
    'FREQ=MONTHLY;BYMONTHDAY=1',
    'FREQ=YEARLY',
    'RRULE:FREQ=WEEKLY',
    'FREQ=DAILY;INTERVAL=2;COUNT=5',
  ])('accepts %s', (rule) => {
    expect(() => parseRule(rule, monday)).not.toThrow();
  });

  it.each([
    ['too frequent', 'FREQ=HOURLY'],
    ['too frequent (minutes)', 'FREQ=MINUTELY'],
    ['too frequent (seconds)', 'FREQ=SECONDLY'],
    ['no frequency', 'BYDAY=MO'],
    ['garbage', 'every other tuesday'],
    ['empty', ''],
    ['smuggled start date', 'FREQ=DAILY;DTSTART=20260101T000000Z'],
  ])('rejects %s', (_label, rule) => {
    expect(() => parseRule(rule, monday)).toThrow(InvalidRecurrenceError);
  });
});

describe('occurrences', () => {
  it('lists the next weekly occurrences on the chosen days', () => {
    const rule = parseRule('FREQ=WEEKLY;BYDAY=MO,TH', monday);

    expect(iso(upcomingOccurrences(rule, monday, 4))).toEqual([
      '2026-11-02T09:00:00.000Z',
      '2026-11-05T09:00:00.000Z',
      '2026-11-09T09:00:00.000Z',
      '2026-11-12T09:00:00.000Z',
    ]);
  });

  it('distinguishes "at or after" from "strictly after"', () => {
    const rule = parseRule('FREQ=DAILY', monday);

    expect(firstOccurrenceFrom(rule, monday)?.toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(occurrenceAfter(rule, monday)?.toISOString()).toBe('2026-11-03T09:00:00.000Z');
  });

  it('never produces occurrences before startsAt', () => {
    const rule = parseRule('FREQ=DAILY', monday);

    expect(firstOccurrenceFrom(rule, new Date('2026-01-01T00:00:00.000Z'))?.toISOString()).toBe(
      '2026-11-02T09:00:00.000Z',
    );
  });

  it('returns null once a limited rule has run out', () => {
    const rule = parseRule('FREQ=DAILY;COUNT=2', monday);

    expect(occurrenceAfter(rule, new Date('2026-11-03T09:00:00.000Z'))).toBeNull();
  });

  it('handles month ends: "the 31st" skips months that do not have one', () => {
    const rule = parseRule('FREQ=MONTHLY;BYMONTHDAY=31', new Date('2026-01-01T00:00:00.000Z'));

    expect(iso(upcomingOccurrences(rule, new Date('2026-01-01T00:00:00.000Z'), 4))).toEqual([
      '2026-01-31T00:00:00.000Z',
      '2026-03-31T00:00:00.000Z',
      '2026-05-31T00:00:00.000Z',
      '2026-07-31T00:00:00.000Z',
    ]);
  });
});
