'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { DailyCount } from '@/lib/api/types';
import { formatDay, niceTicks, separateLabels } from '@/lib/analytics';

const HEIGHT = 220;
const PAD = { top: 12, right: 84, bottom: 26, left: 36 };

const SERIES = [
  { key: 'completed', label: 'Completed', color: 'var(--series-1)' },
  { key: 'created', label: 'Created', color: 'var(--series-2)' },
] as const;

// Width of the element, kept up to date, so the SVG is drawn at its real size (text in a stretched
// viewBox would be stretched too).
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Measured at once too: the observer reports on the next rendering step, which a background
    // tab may not have for a while.
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// Tasks finished and created per day: two thin lines on one axis (same unit, same scale), a legend,
// labels at the line ends, a crosshair with the day's numbers on hover or with the arrow keys, and
// the same numbers as a table for screen readers and for anyone who prefers one.
export function DailyChart({ daily }: { daily: DailyCount[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = Math.max(width - PAD.left - PAD.right, 0);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const ticks = niceTicks(Math.max(0, ...daily.flatMap((d) => [d.completed, d.created])));
  const top = ticks.at(-1) ?? 1;
  const x = (i: number) => PAD.left + (daily.length < 2 ? 0 : (i / (daily.length - 1)) * plotWidth);
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const path = (key: 'completed' | 'created') =>
    daily
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`)
      .join('');

  const last = daily.length - 1;
  const lastPoint = daily.at(-1);
  const [completedLabelY, createdLabelY] = lastPoint
    ? separateLabels(y(lastPoint.completed), y(lastPoint.created), 14)
    : [0, 0];
  const labelY = { completed: completedLabelY, created: createdLabelY };
  const xLabels = daily.length > 0 ? [0, Math.floor(last / 2), last] : [];

  const indexAt = (clientX: number, element: Element) => {
    const left = element.getBoundingClientRect().left;
    const ratio = (clientX - left - PAD.left) / (plotWidth || 1);
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) =>
    setActive(indexAt(event.clientX, event.currentTarget));
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight') setActive((i) => Math.min(last, (i ?? -1) + 1));
    else if (event.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? last + 1) - 1));
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };

  const point = active === null ? null : daily[active];

  return (
    <div className="viz-root space-y-3">
      <ul className="flex gap-4 text-sm text-muted-foreground" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Tasks completed and created per day. Use the left and right arrow keys to read each day."
            tabIndex={0}
            className="touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {tick}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                className="fill-muted-foreground text-[11px]"
              >
                {formatDay(daily[i]?.date ?? '')}
              </text>
            ))}

            {point && (
              <line
                x1={x(active!)}
                x2={x(active!)}
                y1={PAD.top}
                y2={PAD.top + plotHeight}
                className="stroke-muted-foreground"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {SERIES.map((s) => (
              <path
                key={s.key}
                d={path(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {point &&
              SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={x(active!)}
                  cy={y(point[s.key])}
                  r={4}
                  fill={s.color}
                  className="stroke-background"
                  strokeWidth={2}
                />
              ))}
            {last >= 0 &&
              SERIES.map((s) => (
                <text
                  key={s.key}
                  x={x(last) + 8}
                  y={labelY[s.key]}
                  dominantBaseline="middle"
                  className="fill-foreground text-[11px]"
                >
                  {s.label}
                </text>
              ))}
          </svg>
        )}

        {point && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-md border bg-popover px-3 py-2 text-xs shadow-sm"
            style={{
              left: Math.min(Math.max(x(active!) - 70, 0), Math.max(width - 140, 0)),
            }}
          >
            <p className="font-medium">{formatDay(point.date)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
                <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
                <span className="ml-auto pl-3 tabular-nums text-foreground">{point[s.key]}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Show as a table
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">Tasks completed and created per day (UTC)</caption>
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-3 py-1.5 font-medium">Day</th>
                <th className="px-3 py-1.5 text-right font-medium">Completed</th>
                <th className="px-3 py-1.5 text-right font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="px-3 py-1">{formatDay(d.date)}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{d.completed}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{d.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
