'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, Button, Spinner } from '@print-karo/ui';
import { forgotPasswordSchema } from '@print-karo/types';
import { AuthShell } from '../../../components/auth-shell';
import { TextField } from '../../../components/field';
import { authClient } from '../../../lib/auth-client';

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    const email = String(new FormData(e.currentTarget).get('email'));
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setLoading(true);
    await authClient.requestPasswordReset({
      email: parsed.data.email,
      redirectTo: '/reset-password',
    });
    setLoading(false);
    // Always show success to avoid leaking which emails exist.
    setDone(true);
  }

  if (done) {
    return (
      <AuthShell title="Check your email" subtitle="Password reset requested">
        <Alert variant="success">
          If an account exists for that email, we&apos;ve sent a reset link.
        </Alert>
        <Link href="/login" className="text-brand text-sm underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="We'll email you a reset link"
      footer={
        <Link href="/login" className="text-brand underline">
          Back to sign in
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <TextField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          error={fieldError}
          required
        />
        <Button type="submit" disabled={loading}>
          {loading ? <Spinner /> : null}
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
