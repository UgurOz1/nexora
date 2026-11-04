'use client';

import { SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/input';

// The search box in the header: submit opens the search page for the current organization.
export function HeaderSearch({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = text.trim();
    router.push(`/orgs/${orgId}/search${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  };

  return (
    <form method="get" role="search" onSubmit={submit} className="relative hidden sm:block">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Search"
        placeholder="Search"
        className="w-44 pl-8 lg:w-60"
        maxLength={100}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </form>
  );
}
