'use client';

import Link from 'next/link';
import { DeleteProjectDialog } from '@/components/app/delete-project-dialog';
import { ProjectFormDialog } from '@/components/app/project-form-dialog';
import { ErrorState } from '@/components/app/query-state';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization, useOrganizations, useProject } from '@/lib/queries';
import { hasAtLeast } from '@/lib/roles';

const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export function ProjectView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const { data: organization } = useOrganization(orgId);
  const { data: organizations } = useOrganizations();
  const { data: project, error, isPending, refetch } = useProject(orgId, projectId);

  const role = organizations?.find((o) => o.id === orgId)?.role;

  if (isPending) {
    return <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Loading" />;
  }
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => void refetch()}
        notFound={
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-6">
              <p className="font-medium">We could not find that project</p>
              <p className="text-sm text-muted-foreground">It may have been deleted.</p>
              <Link
                href={`/orgs/${orgId}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Back to projects
              </Link>
            </CardContent>
          </Card>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/orgs" className="hover:underline">
          Organizations
        </Link>
        {' / '}
        <Link href={`/orgs/${orgId}`} className="hover:underline">
          {organization?.name ?? 'Organization'}
        </Link>
        {' / '}
        <span className="text-foreground">{project.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {project.department && <Badge variant="secondary">{project.department}</Badge>}
            <span>
              {project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}
            </span>
            <span>· created {date.format(new Date(project.createdAt))}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {hasAtLeast(role, 'MANAGER') && (
            <ProjectFormDialog orgId={orgId} project={project} variant="outline" />
          )}
          {hasAtLeast(role, 'ADMIN') && <DeleteProjectDialog orgId={orgId} project={project} />}
        </div>
      </div>

      {project.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About this project</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
            {project.description}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The task board is coming soon.
        </CardContent>
      </Card>
    </div>
  );
}
