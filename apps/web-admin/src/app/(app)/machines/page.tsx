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
import type { HealthGateResult, MachineSummary } from '@print-karo/types';
import { api } from '../../../lib/api';

function gateVariant(g: HealthGateResult): 'success' | 'warning' | 'danger' {
  if (g === 'READY') return 'success';
  if (g === 'WARNING') return 'warning';
  return 'danger';
}

export default function MachinesPage() {
  const router = useRouter();
  const [machines, setMachines] = useState<MachineSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMachines()
      .then(setMachines)
      .catch((e: unknown) => {
        if (e instanceof Error && /auth/i.test(e.message)) router.push('/login');
        else setError(e instanceof Error ? e.message : 'Failed to load machines.');
      });
  }, [router]);

  const online = machines?.filter((m) => m.online).length ?? 0;
  const offline = machines ? machines.length - online : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Machines</h1>
          {machines ? (
            <div className="flex gap-2">
              <Badge variant="success">{online} online</Badge>
              <Badge variant="muted">{offline} offline</Badge>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-brand text-sm underline">
            Dashboard
          </Link>
          <Link href="/machines/new">
            <Button size="sm">Register machine</Button>
          </Link>
        </div>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Fleet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {machines === null ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : machines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No machines yet. Register your first machine.
            </p>
          ) : (
            machines.map((m) => (
              <Link
                key={m.id}
                href={`/machines/${m.id}`}
                className="border-border hover:bg-muted/50 flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground text-xs">{m.code}</span>
                    {m.online ? (
                      <Badge variant="success">Online</Badge>
                    ) : (
                      <Badge variant="muted">Offline</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {[m.location.college, m.location.building, m.location.room]
                      .filter(Boolean)
                      .join(' · ') || 'No location'}
                    {m.operatorName ? ` · ${m.operatorName}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={gateVariant(m.gateResult)}>{m.gateResult}</Badge>
                  <span className="text-muted-foreground text-sm">{m.runtimeState}</span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
