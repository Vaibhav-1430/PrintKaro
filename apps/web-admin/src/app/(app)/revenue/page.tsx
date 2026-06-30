'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@print-karo/ui';
import type { RevenueSummary } from '@print-karo/types';
import { api } from '../../../lib/api';
import { formatPaise } from '../../../lib/format';

export default function RevenuePage() {
  const router = useRouter();
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .revenue()
      .then(setRevenue)
      .catch((e: unknown) => {
        if (e instanceof Error && /auth/i.test(e.message)) router.push('/login');
        else setError(e instanceof Error ? e.message : 'Failed to load revenue.');
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Revenue</h1>
        <Link href="/orders" className="text-brand text-sm underline">
          Orders
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          {revenue === null ? (
            <Skeleton className="col-span-2 h-32 w-full" />
          ) : (
            <>
              <Stat label="Gross revenue" value={formatPaise(revenue.grossRevenuePaise)} />
              <Stat label="Refunded" value={formatPaise(revenue.refundedPaise)} />
              <Stat label="Net revenue" value={formatPaise(revenue.netRevenuePaise)} />
              <Stat label="Total orders" value={String(revenue.totalOrders)} />
              <Stat label="Paid orders" value={String(revenue.paidOrders)} />
              <Stat label="Completed" value={String(revenue.completedOrders)} />
              <Stat label="Refunded orders" value={String(revenue.refundedOrders)} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex flex-col rounded-md border p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}
