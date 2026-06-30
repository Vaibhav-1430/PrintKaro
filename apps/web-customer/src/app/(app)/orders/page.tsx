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
import type { OrderListItem, OrderStatus } from '@print-karo/types';
import { api } from '../../../lib/api';
import { formatPaise } from '../../../lib/format';

function statusVariant(s: OrderStatus): 'success' | 'warning' | 'danger' | 'muted' {
  if (s === 'COMPLETED') return 'success';
  if (s === 'FAILED' || s === 'EXPIRED' || s === 'CANCELLED') return 'danger';
  if (s === 'PRINTING' || s === 'WAITING_AT_MACHINE' || s === 'PIN_GENERATED') return 'warning';
  return 'muted';
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listOrders()
      .then(setOrders)
      .catch((e: unknown) => {
        if (e instanceof Error && /auth/i.test(e.message)) router.push('/login');
        else setError(e instanceof Error ? e.message : 'Failed to load orders.');
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your orders</h1>
        <Link href="/upload">
          <Button size="sm">New print</Button>
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {orders === null ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders yet.</p>
          ) : (
            orders.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="border-border hover:bg-muted/50 flex items-center justify-between rounded-md border p-3"
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
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
