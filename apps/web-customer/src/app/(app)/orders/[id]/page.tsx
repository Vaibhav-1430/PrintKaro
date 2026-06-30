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
import type { OrderResponse } from '@print-karo/types';
import { api } from '../../../../lib/api';
import { formatPaise } from '../../../../lib/format';

function useCountdown(expiresAt: string | null): string | null {
  const [remaining, setRemaining] = useState<string | null>(null);
  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('expired');
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return remaining;
}

export default function CustomerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .getOrder(id)
      .then(setOrder)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed.'));

  useEffect(() => {
    void load();
    // Poll so PRINTING → COMPLETED updates live while the customer watches.
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const countdown = useCountdown(order?.pinExpiresAt ?? null);

  async function cancel() {
    setBusy(true);
    try {
      await api.cancelOrder(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-lg p-6">
        {error ? <Alert variant="error">{error}</Alert> : <Skeleton className="h-64 w-full" />}
      </main>
    );
  }

  const showPin = order.status === 'PIN_GENERATED' || order.status === 'WAITING_AT_MACHINE';
  const canCancel = ['UPLOADED', 'VALIDATED', 'MACHINE_READY', 'PAYMENT_PENDING'].includes(
    order.status,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
        <Link href="/orders" className="text-brand text-sm underline">
          ← Orders
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Badge variant="muted">{order.status}</Badge>
          <span className="font-medium">{formatPaise(order.amountPaise)}</span>
        </CardContent>
      </Card>

      {showPin ? (
        <Card>
          <CardHeader>
            <CardTitle>Your print PIN</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <p className="text-muted-foreground text-sm">
              Enter this PIN at the machine keypad to release your print.
            </p>
            <p className="text-4xl font-bold tracking-widest">••••</p>
            <p className="text-muted-foreground text-xs">
              The PIN was shown in your payment confirmation notification.
            </p>
            {countdown ? (
              <Badge variant={countdown === 'expired' ? 'danger' : 'warning'}>
                {countdown === 'expired' ? 'Expired' : `Expires in ${countdown}`}
              </Badge>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {order.status === 'PAYMENT_PENDING' ? (
        <Link href={`/order/${id}/pay`}>
          <Button className="w-full">Pay now</Button>
        </Link>
      ) : null}

      {canCancel ? (
        <Button variant="danger" disabled={busy} onClick={cancel}>
          Cancel order
        </Button>
      ) : null}
    </main>
  );
}
