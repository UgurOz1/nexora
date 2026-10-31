import type { Metadata } from 'next';
import { ProjectsView } from '@/components/app/projects-view';

export const metadata: Metadata = { title: 'Projects' };

export default async function OrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <ProjectsView orgId={orgId} />;
}
