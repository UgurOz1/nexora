'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState } from '@/components/app/query-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { highlightPieces } from '@/lib/highlight';
import { STATUS_LABELS } from '@/lib/board';
import { useSearch } from '@/lib/search-queries';

// Waits for a short pause in typing before searching, so a fast typist does not send a request
// per letter.
const TYPING_PAUSE_MS = 250;

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightPieces(text, query).map((piece, index) =>
        piece.match ? (
          <mark key={index} className="rounded bg-primary/20 px-0.5 text-foreground">
            {piece.text}
          </mark>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  );
}

export function SearchView({ orgId }: { orgId: string }) {
  const router = useRouter();
  const urlQuery = useSearchParams().get('q') ?? '';
  const [text, setText] = useState(urlQuery);
  const [settled, setSettled] = useState(urlQuery);

  // The address bar follows the (paused) text, so a search can be shared and survives a reload.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(text);
      const target = text.trim() ? `?q=${encodeURIComponent(text.trim())}` : '?';
      router.replace(`/orgs/${orgId}/search${target}`);
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, orgId, router]);

  const { data, error, isFetching, refetch } = useSearch(orgId, settled);
  const query = settled.trim();
  const nothing = data && data.tasks.length === 0 && data.projects.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <Input
          type="search"
          autoFocus
          aria-label="Search tasks and projects"
          placeholder="Search tasks and projects"
          value={text}
          maxLength={100}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {!query && (
        <p className="text-sm text-muted-foreground">
          Type a few words. Each word matches the start of a word in a title or description.
        </p>
      )}
      {query && !data && !error && (
        <Skeleton className="h-32 w-full" aria-busy="true" aria-label="Searching" />
      )}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {query && nothing && !isFetching && (
        <EmptyState title="No matches">Nothing found for &quot;{query}&quot;.</EmptyState>
      )}

      {data && data.projects.length > 0 && (
        <section aria-labelledby="search-projects" className="space-y-2">
          <h2 id="search-projects" className="text-sm font-semibold">
            Projects
          </h2>
          <ul className="grid gap-1">
            {data.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/orgs/${orgId}/projects/${project.id}`}
                  className="block rounded-lg border p-3 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">
                    <Highlighted text={project.name} query={query} />
                  </span>
                  {project.department && (
                    <span className="ml-2 text-muted-foreground">{project.department}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.tasks.length > 0 && (
        <section aria-labelledby="search-tasks" className="space-y-2">
          <h2 id="search-tasks" className="text-sm font-semibold">
            Tasks
          </h2>
          <ul className="grid gap-1">
            {data.tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/orgs/${orgId}/projects/${task.projectId}?task=${task.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">
                    <Highlighted text={task.title} query={query} />
                    {task.parentId && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        subtask
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {task.projectName} · {STATUS_LABELS[task.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
