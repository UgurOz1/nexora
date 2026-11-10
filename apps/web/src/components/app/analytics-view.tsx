'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { DailyChart } from '@/components/app/analytics/daily-chart';
import { ErrorState } from '@/components/app/query-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration, share } from '@/lib/analytics';
import { useAnalyticsOverview, useTeamStats, type AnalyticsDays } from '@/lib/analytics-queries';
import type { AnalyticsOverview, TeamStats } from '@/lib/api/types';
import { useOrganization, useOrganizations } from '@/lib/queries';
import { hasAtLeast } from '@/lib/roles';

const RANGES: { days: AnalyticsDays; label: string }[] = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

const STATUS_LABELS = [
  ['TODO', 'To do'],
  ['IN_PROGRESS', 'In progress'],
  ['IN_REVIEW', 'In review'],
  ['DONE', 'Done'],
] as const;

const updatedAt = new Intl.DateTimeFormat('en', { timeStyle: 'short' });
const number = new Intl.NumberFormat('en');

export function AnalyticsView({ orgId }: { orgId: string }) {
  const { data: organization } = useOrganization(orgId);
  const { data: organizations } = useOrganizations();
  const [days, setDays] = useState<AnalyticsDays>(30);

  const role = organizations?.find((o) => o.id === orgId)?.role;
  const canSeeTeam = hasAtLeast(role, 'MANAGER');
  const overview = useAnalyticsOverview(orgId, days);
  const team = useTeamStats(orgId, days, canSeeTeam);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href={`/orgs/${orgId}`} className="hover:underline">
          {organization?.name ?? 'Organization'}
        </Link>
        {' / '}
        <span className="text-foreground">Dashboard</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Days are counted in UTC.
            {overview.data &&
              ` Updated ${updatedAt.format(new Date(overview.data.range.generatedAt))}.`}
          </p>
        </div>
        <NativeSelect
          aria-label="Time range"
          className="w-44"
          value={days}
          onChange={(event) => setDays(Number(event.target.value) as AnalyticsDays)}
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {overview.isPending && (
        <Skeleton className="h-96 w-full" aria-busy="true" aria-label="Loading" />
      )}
      {overview.error && (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      )}
      {overview.data && <Overview orgId={orgId} data={overview.data} days={days} />}

      {canSeeTeam && (
        <Section
          title="Team"
          description="Assigned work per member. Visible to managers and above."
        >
          {team.isPending && (
            <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Loading" />
          )}
          {team.error && <ErrorState error={team.error} onRetry={() => void team.refetch()} />}
          {team.data && <TeamTable data={team.data} />}
        </Section>
      )}
    </div>
  );
}

function Overview({
  orgId,
  data,
  days,
}: {
  orgId: string;
  data: AnalyticsOverview;
  days: AnalyticsDays;
}) {
  const { totals } = data;
  const open = totals.byStatus.TODO + totals.byStatus.IN_PROGRESS + totals.byStatus.IN_REVIEW;
  const all = open + totals.byStatus.DONE;

  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Open tasks" value={number.format(open)} />
        <Stat label="Overdue" value={number.format(totals.overdue)} hint="Not done, past due" />
        <Stat label="Due in 7 days" value={number.format(totals.dueSoon)} />
        <Stat
          label={`Completed (${days} days)`}
          value={number.format(totals.completed)}
          hint={`${number.format(totals.created)} created`}
        />
        <Stat
          label="Median time to finish"
          value={formatDuration(totals.medianCycleHours)}
          hint="From creation to done"
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Completed and created per day" className="lg:col-span-2">
          <DailyChart daily={data.daily} />
        </Section>
        <Section title="Tasks by status">
          <ul className="space-y-3">
            {STATUS_LABELS.map(([status, label]) => (
              <li key={status} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {number.format(totals.byStatus[status])} · {share(totals.byStatus[status], all)}
                    %
                  </span>
                </div>
                <div className="viz-root h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${share(totals.byStatus[status], all)}%`,
                      background: 'var(--series-1)',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Projects" description="Most open work first" className="lg:col-span-2">
          {data.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <Table
              caption="Tasks per project"
              headers={['Project', 'Open', 'Overdue', 'Done', `Completed (${days}d)`]}
              rows={data.projects.map((p) => ({
                key: p.id,
                cells: [
                  <Link
                    key="name"
                    href={`/orgs/${orgId}/projects/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.name}
                    {p.department && (
                      <span className="ml-2 font-normal text-muted-foreground">{p.department}</span>
                    )}
                  </Link>,
                  p.open,
                  p.overdue,
                  p.done,
                  p.completed,
                ],
              }))}
            />
          )}
        </Section>
        <Section title="Departments">
          {data.departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <Table
              caption="Tasks per department"
              headers={['Department', 'Open', 'Overdue', `Done (${days}d)`]}
              rows={data.departments.map((d) => ({
                key: d.department ?? '',
                cells: [
                  d.department ?? <span className="text-muted-foreground">No department</span>,
                  d.open,
                  d.overdue,
                  d.completed,
                ],
              }))}
            />
          )}
        </Section>
      </div>
    </>
  );
}

function TeamTable({ data }: { data: TeamStats }) {
  return (
    <div className="space-y-3">
      <Table
        caption="Tasks per member"
        headers={['Member', 'Open', 'Overdue', `Completed (${data.range.days}d)`, 'Median time']}
        rows={data.members.map((m) => ({
          key: m.userId,
          cells: [
            <span key="name">
              {m.name}
              <span className="ml-2 text-xs text-muted-foreground">{m.role.toLowerCase()}</span>
            </span>,
            m.open,
            m.overdue,
            m.completed,
            formatDuration(m.medianCycleHours),
          ],
        }))}
      />
      <p className="text-sm text-muted-foreground">
        Not assigned to a current member: {number.format(data.unassigned.open)} open,{' '}
        {number.format(data.unassigned.overdue)} overdue.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
        {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Table({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-muted">
          <tr>
            {headers.map((header, i) => (
              <th
                key={header}
                scope="col"
                className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              {row.cells.map((cell, i) => (
                <td
                  key={i}
                  className={`px-3 py-1.5 ${i === 0 ? 'text-left' : 'text-right tabular-nums'}`}
                >
                  {typeof cell === 'number' ? number.format(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
