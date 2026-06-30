'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@print-karo/ui';
import type { ActivePinResponse } from '@print-karo/types';
import { api } from '../../../lib/api';

export default function ActivePinsPage() {
  const router = useRouter();
  const [pins, setPins] = useState<ActivePinResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .activePins()
      .then(setPins)
      .catch((e: unknown) => {
        if (e instanceof Error && /auth/i.test(e.message)) router.push('/login');
        else setError(e instanceof Error ? e.message : 'Failed to load PINs.');
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Active PINs</h1>
        <Link href="/orders" className="text-brand text-sm underline">
          Orders
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Unredeemed, non-expired PINs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {pins === null ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : pins.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active PINs.</p>
          ) : (
            pins.map((p) => (
              <div
                key={p.orderId}
                className="border-border flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{p.orderNumber}</span>
                  <span className="text-muted-foreground text-xs">Machine {p.machineId}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-xs">
                    {p.attemptsRemaining} attempts left
                  </span>
                  <Badge variant="warning">
                    Expires {new Date(p.expiresAt).toLocaleTimeString()}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
