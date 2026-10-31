import { Frequency, RRule } from 'rrule';

// Recurrence rules follow RFC 5545 (the iCalendar standard used by Google Calendar, Outlook, ...),
// e.g. "FREQ=WEEKLY;BYDAY=MO,TH" or "FREQ=MONTHLY;BYMONTHDAY=1". All times are UTC.

export class InvalidRecurrenceError extends Error {}

// Nothing shorter than a day: a mistyped rule must not be able to create thousands of tasks.
const ALLOWED_FREQUENCIES: readonly Frequency[] = [
  Frequency.DAILY,
  Frequency.WEEKLY,
  Frequency.MONTHLY,
  Frequency.YEARLY,
];

export function parseRule(rule: string, startsAt: Date): RRule {
  const text = rule.trim().replace(/^RRULE:/i, '');
  if (/DTSTART|TZID/i.test(text)) {
    throw new InvalidRecurrenceError('Do not put DTSTART or TZID in the rule; use startsAt');
  }

  let options;
  try {
    options = RRule.parseString(text);
  } catch {
    throw new InvalidRecurrenceError('The recurrence rule is not valid');
  }
  if (options.freq === undefined || !ALLOWED_FREQUENCIES.includes(options.freq)) {
    throw new InvalidRecurrenceError('Frequency must be DAILY, WEEKLY, MONTHLY or YEARLY');
  }

  try {
    return new RRule({ ...options, dtstart: startsAt });
  } catch {
    throw new InvalidRecurrenceError('The recurrence rule is not valid');
  }
}

// The first occurrence at or after `from` (null when the rule has run out, e.g. COUNT=3 reached).
export function firstOccurrenceFrom(rule: RRule, from: Date): Date | null {
  return rule.after(from, true);
}

// The first occurrence strictly after `from`.
export function occurrenceAfter(rule: RRule, from: Date): Date | null {
  return rule.after(from, false);
}

// The next `count` occurrences at or after `from`, computed one at a time (no big date lists).
export function upcomingOccurrences(rule: RRule, from: Date, count: number): Date[] {
  const result: Date[] = [];
  let next = firstOccurrenceFrom(rule, from);
  while (next && result.length < count) {
    result.push(next);
    next = occurrenceAfter(rule, next);
  }
  return result;
}
