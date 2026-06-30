'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Spinner,
} from '@print-karo/ui';
import type { OrderResponse, PaymentResult } from '@print-karo/types';
import { api } from '../../../../../lib/api';
import { formatPaise } from '../../../../../lib/format';

const OUTCOMES: {
  label: string;
  outcome: PaymentResult;
  variant: 'default' | 'outline' | 'danger';
}[] = [
  { label: 'Pay (success)', outcome: 'SUCCESS', variant: 'default' },
  { label: 'Simulate failure', outcome: 'FAILURE', variant: 'outline' },
  { label: 'Simulate timeout', outcome: 'TIMEOUT', variant: 'outline' },
  { label: 'Cancel', outcome: 'CANCELLED', variant: 'danger' },
];

export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrder(id)
      .then(async (o) => {
        setOrder(o);
        // Ensure a payment is initiated so the demo buttons can charge it.
        if (o.status === 'PAYMENT_PENDING' && !o.paymentStatus) {
          await api.initiatePayment(id).catch(() => undefined);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed.'));
  }, [id]);

  async function pay(outcome: PaymentResult) {
    setBusy(true);
    setError(null);
    try {
      await api.initiatePayment(id).catch(() => undefined);
      const payment = await api.simulatePayment(id, outcome);
      if (payment.status === 'SUCCEEDED') {
        router.push(`/orders/${id}`);
      } else {
        setError(`Payment ${payment.status.toLowerCase()}. You can try again.`);
        setOrder(await api.getOrder(id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-md p-6">
        {error ? <Alert variant="error">{error}</Alert> : <Skeleton className="h-48 w-full" />}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payment (demo)</h1>
        <Link href={`/order/${id}/options`} className="text-brand text-sm underline">
          ← Options
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Order {order.orderNumber}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-3xl font-bold">{formatPaise(order.amountPaise)}</p>
          <p className="text-muted-foreground text-xs">
            Demo payment — no real gateway. Choose an outcome to simulate.
          </p>
          <div className="flex flex-col gap-2">
            {OUTCOMES.map((o) => (
              <Button
                key={o.outcome}
                variant={o.variant}
                onClick={() => pay(o.outcome)}
                disabled={busy}
              >
                {busy ? <Spinner /> : null}
                {o.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
