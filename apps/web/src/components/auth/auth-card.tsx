import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// The frame shared by all sign-in related screens.
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
      {footer && (
        <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>
      )}
    </Card>
  );
}
