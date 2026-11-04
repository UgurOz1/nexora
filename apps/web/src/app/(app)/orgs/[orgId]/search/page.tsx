import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchView } from '@/components/app/search-view';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  // SearchView reads ?q= from the address bar, which needs a Suspense boundary.
  return (
    <Suspense>
      <SearchView orgId={orgId} />
    </Suspense>
  );
}
