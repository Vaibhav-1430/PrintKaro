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
import type { OrderResponse, PrintOptionInput } from '@print-karo/types';
import { api } from '../../../../../lib/api';
import { formatPaise } from '../../../../../lib/format';

export default function OrderOptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [opts, setOpts] = useState<PrintOptionInput>({
    copies: 1,
    colorMode: 'BW',
    duplex: false,
    paperSize: 'A4',
    orientation: 'portrait',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrder(id)
      .then(setOrder)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed.'));
  }, [id]);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.setOrderOptions(id, opts);
      setOrder(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save options.');
    } finally {
      setBusy(false);
    }
  }

  async function onContinue() {
    setBusy(true);
    setError(null);
    try {
      await api.verifyMachine(id);
      router.push(`/order/${id}/pay`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Machine is not ready.');
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-xl p-6">
        {error ? <Alert variant="error">{error}</Alert> : <Skeleton className="h-64 w-full" />}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Print options</h1>
        <Link href="/upload" className="text-brand text-sm underline">
          ← Back
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Order {order.orderNumber}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <label className="flex items-center justify-between gap-3">
            Copies
            <input
              type="number"
              min={1}
              max={500}
              value={opts.copies}
              onChange={(e) => setOpts({ ...opts, copies: Number(e.target.value) })}
              className="border-border w-24 rounded-md border bg-transparent p-1"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            Colour
            <select
              value={opts.colorMode}
              onChange={(e) => setOpts({ ...opts, colorMode: e.target.value as 'BW' | 'COLOR' })}
              className="border-border rounded-md border bg-transparent p-1"
            >
              <option value="BW">Black &amp; White</option>
              <option value="COLOR">Colour</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            Paper size
            <select
              value={opts.paperSize}
              onChange={(e) =>
                setOpts({ ...opts, paperSize: e.target.value as 'A4' | 'A3' | 'LEGAL' })
              }
              className="border-border rounded-md border bg-transparent p-1"
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="LEGAL">Legal</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            Double-sided
            <input
              type="checkbox"
              checked={opts.duplex}
              onChange={(e) => setOpts({ ...opts, duplex: e.target.checked })}
            />
          </label>
          <Button variant="outline" onClick={onSave} disabled={busy}>
            {busy ? <Spinner /> : null}
            Calculate price
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Total</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-2xl font-bold">{formatPaise(order.amountPaise)}</span>
          <Button onClick={onContinue} disabled={busy || !order.printOption}>
            {busy ? <Spinner /> : null}
            Verify machine &amp; pay
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
