'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
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
import { api, type MachineDetail } from '../../../../lib/api';

export default function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .machineDetail(id)
      .then(setMachine)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed.'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !machine) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="error">{error}</Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <Link href="/machines" className="text-brand text-sm underline">
        ← Back to machines
      </Link>

      {!machine ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{machine.name}</h1>
              <p className="text-muted-foreground text-sm">
                {machine.code} · {machine.type}
              </p>
            </div>
            {machine.online ? (
              <Badge variant="success">Online</Badge>
            ) : (
              <Badge variant="muted">Offline</Badge>
            )}
          </header>

          {error ? <Alert variant="error">{error}</Alert> : null}

          <Card>
            <CardHeader>
              <CardTitle>Health</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="Gate">
                <Badge
                  variant={
                    machine.health?.gateResult === 'READY'
                      ? 'success'
                      : machine.health?.gateResult === 'WARNING'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {machine.health?.gateResult ?? 'BLOCKED'}
                </Badge>
              </Row>
              <Row label="Health score">{machine.health?.healthScore ?? 0}/100</Row>
              <Row label="Runtime state">{machine.health?.runtimeState ?? 'OFFLINE'}</Row>
              <Row label="Printer">
                {machine.printer?.printerName ?? 'None'} ({machine.printer?.state ?? 'UNKNOWN'})
              </Row>
              <Row label="Last heartbeat">
                {machine.lastHeartbeatAt
                  ? new Date(machine.lastHeartbeatAt).toLocaleString()
                  : 'Never'}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location & operator</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="College">{machine.location.college ?? '—'}</Row>
              <Row label="Building">{machine.location.building ?? '—'}</Row>
              <Row label="Room">{machine.location.room ?? '—'}</Row>
              <Row label="Operator">{machine.operator?.name ?? 'Unassigned'}</Row>
              <Row label="Lifecycle">
                <Badge variant={machine.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {machine.status}
                </Badge>
              </Row>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act(() => api.restartMachine(id))}
            >
              Restart
            </Button>
            {machine.status === 'ACTIVE' ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void act(() => api.suspendMachine(id))}
              >
                Suspend
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void act(() => api.reactivateMachine(id))}>
                Reactivate
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
