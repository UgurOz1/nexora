import type { Metadata } from 'next';
import { AnalyticsView } from '@/components/app/analytics-view';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AnalyticsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <AnalyticsView orgId={orgId} />;
}
