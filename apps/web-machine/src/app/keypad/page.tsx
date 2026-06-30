'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@print-karo/ui';
import { machineApi } from '../../lib/api';

/**
 * At-the-machine PIN keypad. The customer enters the PIN shown on their phone;
 * the machine (authenticated) redeems it, which unlocks the print job for the
 * agent to download + print. The PIN never travels through the customer web app.
 */
export default function KeypadPage() {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  function press(d: string) {
    if (pin.length < 4) setPin(pin + d);
  }
  function clear() {
    setPin('');
    setStatus('idle');
    setMessage(null);
  }

  async function submit() {
    if (pin.length !== 4) return;
    try {
      const res = await machineApi.redeemPin(pin);
      if (res.hasJob && res.job) {
        setStatus('ok');
        setMessage(`Releasing print for order ${res.job.orderNumber}…`);
      } else {
        setStatus('ok');
        setMessage('PIN accepted. Your print will start shortly.');
      }
      setPin('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Invalid PIN.');
      setPin('');
    }
  }

  return (
    <main className="bg-muted/30 flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Enter your print PIN</CardTitle>
          {!machineApi.isAuthenticated ? (
            <p className="text-danger text-sm">
              Machine not authenticated.{' '}
              <Link href="/" className="underline">
                Authenticate first
              </Link>
              .
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="border-border flex h-12 w-10 items-center justify-center rounded-md border text-2xl font-bold"
              >
                {pin[i] ?? ''}
              </div>
            ))}
          </div>

          {message ? (
            <Alert variant={status === 'error' ? 'error' : 'success'}>{message}</Alert>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <Button key={d} variant="outline" onClick={() => press(d)}>
                {d}
              </Button>
            ))}
            <Button variant="outline" onClick={clear}>
              Clear
            </Button>
            <Button variant="outline" onClick={() => press('0')}>
              0
            </Button>
            <Button onClick={submit} disabled={pin.length !== 4 || !machineApi.isAuthenticated}>
              OK
            </Button>
          </div>

          <Badge variant="muted">Print Karo</Badge>
        </CardContent>
      </Card>
    </main>
  );
}
