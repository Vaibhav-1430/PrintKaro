'use client';

import { useEffect, useState } from 'react';
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
import type { MachineSummary, UploadResponse } from '@print-karo/types';
import { api } from '../../../lib/api';

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function UploadPage() {
  const router = useRouter();
  const [machines, setMachines] = useState<MachineSummary[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [machineId, setMachineId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .machines()
      .then((list) => {
        setMachines(list);
        const ready = list.find((m) => m.online && m.gateResult === 'READY');
        if (ready) setMachineId(ready.id);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && /auth/i.test(e.message)) router.push('/login');
        else setError(e instanceof Error ? e.message : 'Failed to load machines.');
      });
  }, [router]);

  async function onUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const sha = await sha256Hex(file);
      const ticket = await api.requestUpload({
        filename: file.name,
        mimeType: file.type || 'application/pdf',
        sizeBytes: file.size,
        sha256: sha,
      });
      // Upload bytes directly to storage (no-op locally with Fake storage).
      await fetch(ticket.presignedPutUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      }).catch(() => undefined);
      const confirmed = await api.confirmUpload(ticket.uploadId, sha);
      setUpload(confirmed);
      if (confirmed.status === 'REJECTED') {
        setError(confirmed.rejectionReason ?? 'File rejected.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateOrder() {
    if (!upload || !machineId) return;
    setBusy(true);
    setError(null);
    try {
      const order = await api.createOrder({ uploadId: upload.id, machineId });
      router.push(`/order/${order.id}/options`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create order.');
    } finally {
      setBusy(false);
    }
  }

  const validated = upload?.status === 'VALIDATED';

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New print</h1>
        <Link href="/orders" className="text-brand text-sm underline">
          My orders
        </Link>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Choose a document</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button onClick={onUpload} disabled={!file || busy || validated}>
            {busy && !validated ? <Spinner /> : null}
            {validated ? 'Uploaded ✓' : 'Upload'}
          </Button>
          {validated && upload.metadata ? (
            <p className="text-muted-foreground text-xs">
              {upload.metadata.pageCount} page(s) · {upload.metadata.paperSize} ·{' '}
              {upload.metadata.orientation}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Choose a machine</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {machines === null ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="border-border rounded-md border bg-transparent p-2 text-sm"
            >
              <option value="">Select a machine…</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.online || m.gateResult === 'BLOCKED'}>
                  {m.name} ({m.code}) — {m.online ? m.gateResult : 'offline'}
                </option>
              ))}
            </select>
          )}
          <Button onClick={onCreateOrder} disabled={!validated || !machineId || busy}>
            {busy && validated ? <Spinner /> : null}
            Continue to options
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
