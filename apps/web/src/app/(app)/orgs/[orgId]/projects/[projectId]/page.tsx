import type { Metadata } from 'next';
import { ProjectView } from '@/components/app/project-view';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = await params;
  return <ProjectView orgId={orgId} projectId={projectId} />;
}
