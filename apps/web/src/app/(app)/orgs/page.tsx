import type { Metadata } from 'next';
import { OrganizationsView } from '@/components/app/organizations-view';

export const metadata: Metadata = { title: 'Organizations' };

export default function OrganizationsPage() {
  return <OrganizationsView />;
}
