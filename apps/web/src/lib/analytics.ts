// Pure helpers for the analytics page: number formats and chart scales.

// "4.5 h" below two days, "3.2 d" above; "—" when nothing was finished.
export function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

const dayFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

// "2026-11-09" -> "Nov 9". The API's days are UTC days, so they are formatted in UTC too
// (formatting in the viewer's zone could show the day before).
export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

// A round top for the y axis and evenly spaced ticks up to it: 0, 5, 10, 15, 20 for a max of 17.
// Steps are 1, 2 or 5 times a power of ten, the steps people read without effort.
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value));
  return ticks;
}

// Percentage of a part in a whole, for the status bars; 0 when the whole is 0.
export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

// Two labels at the end of the lines must not sit on top of each other: if they are closer than
// `gap` pixels, they are pushed apart around their middle.
export function separateLabels(a: number, b: number, gap: number): [number, number] {
  if (Math.abs(a - b) >= gap) return [a, b];
  const middle = (a + b) / 2;
  return a <= b ? [middle - gap / 2, middle + gap / 2] : [middle + gap / 2, middle - gap / 2];
}
