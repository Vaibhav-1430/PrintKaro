'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@print-karo/ui';
import type { SessionInfo } from '@print-karo/types';
import { api } from '../../../lib/api';
import { signOut } from '../../../lib/auth-client';

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .sessions()
      .then(setSessions)
      .catch(() => router.push('/login'));
  }, [router]);

  async function revoke(id: string) {
    // Optimistic: drop it immediately, restore on failure.
    const previous = sessions;
    setSessions((s) => s?.filter((x) => x.id !== id) ?? null);
    try {
      await api.revokeSession(id);
    } catch (err) {
      setSessions(previous ?? null);
      setError(err instanceof Error ? err.message : 'Could not revoke session.');
    }
  }

  async function logoutAll() {
    await api.logoutAll();
    await signOut();
    router.push('/login');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Active sessions</h1>
        <Link href="/profile" className="text-brand text-sm underline">
          Back to profile
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Devices signed in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? <Alert variant="error">{error}</Alert> : null}
          {sessions === null ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active sessions.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="border-border flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {s.browser ?? 'Unknown browser'} · {s.os ?? 'Unknown OS'}
                    </span>
                    {s.current ? <Badge variant="success">This device</Badge> : null}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {s.deviceType ?? 'device'} · {s.ipAddress ?? 'unknown IP'} · last active{' '}
                    {new Date(s.lastActivityAt).toLocaleString()}
                  </span>
                </div>
                {!s.current ? (
                  <Button variant="outline" size="sm" onClick={() => revoke(s.id)}>
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button variant="danger" onClick={logoutAll}>
        Log out of all devices
      </Button>
    </main>
  );
}
