import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@print-karo/ui';
import { ThemeToggle } from './theme-toggle';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="bg-muted/30 flex min-h-screen flex-col">
      <header className="flex items-center justify-between p-4">
        <Link href="/" className="text-brand text-lg font-bold">
          Print Karo
        </Link>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </div>
      {footer ? (
        <footer className="text-muted-foreground p-4 text-center text-sm">{footer}</footer>
      ) : null}
    </main>
  );
}
