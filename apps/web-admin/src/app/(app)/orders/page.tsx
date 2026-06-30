'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@print-karo/ui';
import type { OrderListItem, OrderStatus, RevenueSummary } from '@print-karo/types';
import { api } from '../../../lib/api';
import { formatPaise } from '../../../lib/format';

function statusVariant(s: OrderStatus): 'success' | 'warning' | 'danger' | 'muted' {
  if (s === 'COMPLETED') return 'success';
  if (s === 'FAILED' || s === 'EXPIRED' || s === 'CANCELLED' || s === 'REFUNDED') return 'danger';
  if (s === 'PRINTING' || s === 'WAITING_AT_MACHINE') return 'warning';
  return 'muted';
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listOrders(), api.revenue()])
      .then(([o, r]) => {
        setOrders(o);
        setRevenue(r);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && /auth/i.test(e.message)) router.push('/login');
        else setError(e instanceof Error ? e.message : 'Failed to load orders.');
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/revenue" className="text-brand underline">
            Revenue
          </Link>
          <Link href="/pins" className="text-brand underline">
            Active PINs
          </Link>
          <Link href="/" className="text-brand underline">
            Dashboard
          </Link>
        </div>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {revenue ? (
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <Stat label="Gross" value={formatPaise(revenue.grossRevenuePaise)} />
            <Stat label="Refunded" value={formatPaise(revenue.refundedPaise)} />
            <Stat label="Net" value={formatPaise(revenue.netRevenuePaise)} />
            <Stat label="Total orders" value={String(revenue.totalOrders)} />
            <Stat label="Paid" value={String(revenue.paidOrders)} />
            <Stat label="Completed" value={String(revenue.completedOrders)} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All orders</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {orders === null ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders yet.</p>
          ) : (
            orders.map((o) => (
              <div
                key={o.id}
                className="border-border flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{o.orderNumber}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(o.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{formatPaise(o.amountPaise)}</span>
                  <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}
