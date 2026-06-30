'use client';

import { useEffect, useState, type FormEvent } from 'react';
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
  Spinner,
} from '@print-karo/ui';
import { pricingRuleSchema, type PricingRuleResponse } from '@print-karo/types';
import { api } from '../../../lib/api';
import { formatPaise } from '../../../lib/format';

export default function PricingPage() {
  const router = useRouter();
  const [rules, setRules] = useState<PricingRuleResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .pricingRules()
      .then(setRules)
      .catch((e: unknown) => {
        if (e instanceof Error && /auth/i.test(e.message)) router.push('/login');
        else setError(e instanceof Error ? e.message : 'Failed to load rules.');
      });

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const parsed = pricingRuleSchema.safeParse({
      machineId: form.get('machineId') || undefined,
      paperSize: form.get('paperSize'),
      bwPerPagePaise: Number(form.get('bwPerPagePaise')),
      colorPerPagePaise: Number(form.get('colorPerPagePaise')),
      duplexDiscountPct: Number(form.get('duplexDiscountPct') || 0),
      active: true,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid rule.');
      return;
    }
    setBusy(true);
    try {
      await api.upsertPricingRule(parsed.data);
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save rule.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pricing rules</h1>
        <Link href="/" className="text-brand text-sm underline">
          Dashboard
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add / update a rule</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 text-sm" onSubmit={onSubmit}>
            <input
              name="machineId"
              placeholder="Machine ID (blank = global default)"
              className="border-border rounded-md border bg-transparent p-2"
            />
            <select name="paperSize" className="border-border rounded-md border bg-transparent p-2">
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="LEGAL">Legal</option>
            </select>
            <label className="flex items-center justify-between gap-2">
              B&amp;W price (paise/page)
              <input
                name="bwPerPagePaise"
                type="number"
                defaultValue={200}
                className="border-border w-28 rounded-md border bg-transparent p-1"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              Colour price (paise/page)
              <input
                name="colorPerPagePaise"
                type="number"
                defaultValue={1000}
                className="border-border w-28 rounded-md border bg-transparent p-1"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              Duplex discount (%)
              <input
                name="duplexDiscountPct"
                type="number"
                defaultValue={0}
                className="border-border w-28 rounded-md border bg-transparent p-1"
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              Save rule
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current rules</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {rules === null ? (
            <Skeleton className="h-16 w-full" />
          ) : rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No rules — the default (₹2 B&amp;W / ₹10 colour) applies.
            </p>
          ) : (
            rules.map((r) => (
              <div
                key={r.id}
                className="border-border flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {r.machineId ? `Machine ${r.machineId.slice(0, 8)}` : 'Global'} · {r.paperSize}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    B&amp;W {formatPaise(r.bwPerPagePaise)} · Colour{' '}
                    {formatPaise(r.colorPerPagePaise)} · Duplex −{r.duplexDiscountPct}%
                  </span>
                </div>
                <Badge variant={r.active ? 'success' : 'muted'}>
                  {r.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
