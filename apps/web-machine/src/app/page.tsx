'use client';

import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Spinner,
} from '@print-karo/ui';
import { APP_NAME, machineLoginSchema } from '@print-karo/types';
import { machineApi } from '../lib/api';

/**
 * Machine authentication / provisioning screen. Real machines authenticate via
 * the agent over the backend API; this screen exercises and verifies that flow
 * (id + secret -> JWT pair). Machines never use a UI in production.
 */
export default function MachineAuthPage() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setAuthed(false);
    const form = new FormData(e.currentTarget);
    const parsed = machineLoginSchema.safeParse({
      machineId: form.get('machineId'),
      machineSecret: form.get('machineSecret'),
    });
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }

    setLoading(true);
    try {
      await machineApi.login(parsed.data.machineId, parsed.data.machineSecret);
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bg-muted/30 flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <p className="text-brand text-sm font-semibold uppercase tracking-wide">Machine</p>
        <h1 className="mt-2 text-3xl font-bold">{APP_NAME}</h1>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Machine authentication</CardTitle>
          <p className="text-muted-foreground text-sm">
            Authenticate this device with its ID and secret.
          </p>
        </CardHeader>
        <CardContent>
          {authed ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Badge variant="success">Authenticated</Badge>
              <p className="text-muted-foreground text-sm">
                Tokens issued. The agent uses them for heartbeat &amp; jobs; the keypad uses them to
                redeem print PINs.
              </p>
              <a href="/keypad">
                <Button>Open PIN keypad</Button>
              </a>
              <Button variant="outline" onClick={() => setAuthed(false)}>
                Authenticate another
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              {error ? <Alert variant="error">{error}</Alert> : null}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="machineId">Machine ID</Label>
                <Input id="machineId" name="machineId" required />
                {fieldErrors.machineId ? (
                  <p className="text-danger text-xs">{fieldErrors.machineId}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="machineSecret">Machine secret</Label>
                <Input id="machineSecret" name="machineSecret" type="password" required />
                {fieldErrors.machineSecret ? (
                  <p className="text-danger text-xs">{fieldErrors.machineSecret}</p>
                ) : null}
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner /> : null}
                Authenticate
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
