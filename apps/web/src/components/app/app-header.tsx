'use client';

import { ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/lib/auth/auth-provider';
import { useMe, useOrganizations } from '@/lib/queries';

export function AppHeader() {
  const { logout } = useAuth();
  const { orgId } = useParams<{ orgId?: string }>();
  const { data: me } = useMe();
  const { data: organizations } = useOrganizations();
  const current = organizations?.find((organization) => organization.id === orgId);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-6">
        <Link href="/orgs" className="text-lg font-semibold tracking-tight">
          NEXORA
        </Link>

        {orgId && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
              {current?.name ?? 'Organization'}
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
                {organizations?.map((organization) => (
                  <DropdownMenuItem
                    key={organization.id}
                    render={<Link href={`/orgs/${organization.id}`} />}
                  >
                    {organization.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/orgs" />}>All organizations</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              {me?.name ?? 'Account'}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  {me?.email}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                // RequireAuth sees the session end and sends the person to the sign-in page.
                onClick={() => void logout()}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
