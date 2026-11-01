'use client';

import { BellIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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
import type { Notification } from '@/lib/api/types';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '@/lib/collab-queries';
import { cn } from '@/lib/utils';

export function notificationText(notification: Notification): string {
  const who = notification.actor.name;
  return notification.type === 'MENTION'
    ? `${who} mentioned you in "${notification.task.title}"`
    : `${who} assigned you "${notification.task.title}"`;
}

const day = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function NotificationBell({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const { data: unread } = useUnreadCount(orgId);
  // The list is fetched only when the menu is opened; the count is polled all the time.
  const { data: page, error } = useNotifications(orgId, open);
  const markRead = useMarkNotificationRead(orgId);
  const markAll = useMarkAllNotificationsRead(orgId);
  const count = unread?.count ?? 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
            className="relative"
          />
        }
      >
        <BellIcon aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            Notifications
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={markAll.isPending}
                onClick={() => markAll.mutate()}
              >
                Mark all as read
              </Button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {error && (
          <p className="px-2 py-3 text-sm text-destructive">Could not load notifications.</p>
        )}
        {page && page.items.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nothing yet.</p>
        )}
        {page?.items.map((notification) => (
          <DropdownMenuItem
            key={notification.id}
            className="items-start gap-2"
            render={
              <Link
                href={`/orgs/${orgId}/projects/${notification.task.projectId}?task=${notification.task.id}`}
                onClick={() => {
                  if (!notification.readAt) markRead.mutate(notification.id);
                }}
              />
            }
          >
            <span
              aria-hidden
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                notification.readAt ? 'bg-transparent' : 'bg-primary',
              )}
            />
            <span className="grid gap-0.5">
              <span className={cn('text-sm', !notification.readAt && 'font-medium')}>
                {notificationText(notification)}
                {!notification.readAt && <span className="sr-only"> (unread)</span>}
              </span>
              <time className="text-xs text-muted-foreground" dateTime={notification.createdAt}>
                {day.format(new Date(notification.createdAt))}
              </time>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
