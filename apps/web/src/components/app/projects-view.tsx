'use client';

import Link from 'next/link';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/app/query-state';
import { ProjectFormDialog } from '@/components/app/project-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { hasAtLeast } from '@/lib/roles';
import { useOrganization, useOrganizations, useProjects } from '@/lib/queries';

export function ProjectsView({ orgId }: { orgId: string }) {
  const { data: organization } = useOrganization(orgId);
  const { data: organizations } = useOrganizations();
  const { data: projects, error, isPending, refetch } = useProjects(orgId);

  const role = organizations?.find((o) => o.id === orgId)?.role;
  const canCreate = hasAtLeast(role, 'MANAGER');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{organization?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Projects
            {organization &&
              ` · ${organization.memberCount} ${organization.memberCount === 1 ? 'member' : 'members'}`}
          </p>
        </div>
        {canCreate && <ProjectFormDialog orgId={orgId} />}
      </div>

      {isPending && <ListSkeleton />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {projects && projects.length === 0 && (
        <EmptyState title="No projects yet">
          {canCreate
            ? 'Create the first one to start organizing work.'
            : 'A manager can create the first one.'}
        </EmptyState>
      )}
      {projects && projects.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/orgs/${orgId}/projects/${project.id}`}
                className="block h-full rounded-xl focus-visible:outline-2"
              >
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    )}
                    <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                      {project.department && (
                        <Badge variant="secondary">{project.department}</Badge>
                      )}
                      <span>
                        {project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
