'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Spinner } from '@print-karo/ui';
import { AuthShell } from '../../../components/auth-shell';
import { authClient } from '../../../lib/auth-client';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'verifying' | 'ok' | 'error'>('verifying');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    authClient
      .verifyEmail({ query: { token } })
      .then((res) => setState(res.error ? 'error' : 'ok'))
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'verifying') {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner /> Verifying your email…
      </div>
    );
  }
  if (state === 'ok') {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">Your email is verified. You can now sign in.</Alert>
        <Link href="/login">
          <Button>Continue to sign in</Button>
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="error">This verification link is invalid or has expired.</Alert>
      <Link href="/login" className="text-brand text-sm underline">
        Back to sign in
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Email verification">
      <Suspense fallback={<Spinner />}>
        <VerifyInner />
      </Suspense>
    </AuthShell>
  );
}
