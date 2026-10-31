import type { ReactNode } from 'react';

// For standalone screens reached from an email or a redirect (confirm email, Google callback).
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <p className="text-center text-2xl font-semibold tracking-tight">NEXORA</p>
        {children}
      </div>
    </main>
  );
}
