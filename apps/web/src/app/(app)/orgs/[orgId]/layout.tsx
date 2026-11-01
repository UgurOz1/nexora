import type { ReactNode } from 'react';
import { OrgGate } from '@/components/app/org-gate';

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  // In a server component `params` is a Promise in current Next.js versions.
  const { orgId } = await params;
  return <OrgGate orgId={orgId}>{children}</OrgGate>;
}
