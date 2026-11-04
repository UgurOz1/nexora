import type { Metadata } from 'next';
import { AuditLogView } from '@/components/app/audit-log-view';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <AuditLogView orgId={orgId} />;
}
