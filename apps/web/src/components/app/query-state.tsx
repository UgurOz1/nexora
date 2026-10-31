import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api/errors';

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-28" />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  // What a 404 means on this screen ("not found" is not a failure to retry).
  notFound?: ReactNode;
}

export function ErrorState({ error, onRetry, notFound }: ErrorStateProps) {
  if (notFound && error instanceof ApiError && error.status === 404) {
    return <>{notFound}</>;
  }
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-6">
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error, 'We could not load this. Please try again.')}
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-medium">{title}</p>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </CardContent>
    </Card>
  );
}
