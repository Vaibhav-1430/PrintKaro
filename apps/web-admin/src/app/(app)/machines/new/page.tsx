'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@print-karo/ui';
import { registerMachineSchema, type MachineRegistrationResult } from '@print-karo/types';
import { TextField } from '../../../../components/field';
import { api } from '../../../../lib/api';

export default function RegisterMachinePage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<MachineRegistrationResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const form = new FormData(e.currentTarget);
    const parsed = registerMachineSchema.safeParse({
      name: form.get('name'),
      code: form.get('code'),
      college: form.get('college') || undefined,
      building: form.get('building') || undefined,
      floor: form.get('floor') || undefined,
      room: form.get('room') || undefined,
      printerName: form.get('printerName') || undefined,
      colorSupport: form.get('colorSupport') === 'on',
      duplexSupport: form.get('duplexSupport') === 'on',
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setLoading(true);
    try {
      const res = await api.registerMachine(parsed.data);
      setCreated(res);
      e.currentTarget.reset();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not register machine.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-6">
      <Link href="/machines" className="text-brand text-sm underline">
        ← Back to machines
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Register machine</CardTitle>
          <p className="text-muted-foreground text-sm">Admin or Super Admin.</p>
        </CardHeader>
        <CardContent>
          {created ? (
            <div className="flex flex-col gap-3">
              <Alert variant="success">Machine registered: {created.code}</Alert>
              <div className="border-warning/40 bg-warning/10 rounded-md border p-3">
                <p className="text-warning text-sm font-medium">
                  Copy this secret now — it is shown only once.
                </p>
                <p className="mt-1 break-all font-mono text-xs">{created.machineSecret}</p>
                <p className="text-muted-foreground mt-2 text-xs">Machine ID: {created.id}</p>
              </div>
              <Button variant="outline" onClick={() => setCreated(null)}>
                Register another
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              {formError ? <Alert variant="error">{formError}</Alert> : null}
              <TextField id="name" name="name" label="Machine name" error={errors.name} required />
              <TextField
                id="code"
                name="code"
                label="Code (e.g. PK-DEL-001)"
                error={errors.code}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField id="college" name="college" label="College" error={errors.college} />
                <TextField id="building" name="building" label="Building" error={errors.building} />
                <TextField id="floor" name="floor" label="Floor" error={errors.floor} />
                <TextField id="room" name="room" label="Room" error={errors.room} />
              </div>
              <TextField id="printerName" name="printerName" label="Printer name (optional)" />
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="colorSupport" /> Color
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="duplexSupport" /> Duplex
                </label>
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner /> : null}
                Register machine
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
