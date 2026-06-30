import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@print-karo/ui';
import { APP_NAME, APP_TAGLINE } from '@print-karo/types';
import { ThemeToggle } from '../components/theme-toggle';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 p-6">
      <div className="flex w-full justify-end">
        <ThemeToggle />
      </div>
      <div className="text-center">
        <p className="text-brand text-sm font-semibold uppercase tracking-wide">Customer Portal</p>
        <h1 className="mt-2 text-4xl font-bold">{APP_NAME}</h1>
        <p className="text-muted-foreground mt-2 text-lg">{APP_TAGLINE}</p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Print something</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Upload a document, pick a machine, choose options, pay, and collect your print with a
            secure PIN.
          </p>
          <div className="flex gap-3">
            <Link href="/upload">
              <Button>Start a print</Button>
            </Link>
            <Link href="/orders">
              <Button variant="outline">My orders</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline">Sign in</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
