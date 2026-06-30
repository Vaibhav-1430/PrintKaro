'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Spinner } from '@print-karo/ui';
import { resetPasswordSchema, checkPasswordStrength } from '@print-karo/types';
import { AuthShell } from '../../../components/auth-shell';
import { TextField } from '../../../components/field';
import { authClient } from '../../../lib/auth-client';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');

  if (!token) {
    return <Alert variant="error">Invalid or missing reset token.</Alert>;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setFieldError(parsed.error.issues.find((i) => i.path[0] === 'password')?.message);
      return;
    }

    setLoading(true);
    const { error: err } = await authClient.resetPassword({
      newPassword: parsed.data.password,
      token,
    });
    setLoading(false);

    if (err) {
      setError(err.message ?? 'Could not reset password. The link may have expired.');
      return;
    }
    router.push('/login');
  }

  const checks = checkPasswordStrength(password);

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <TextField
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldError}
        required
      />
      {password.length > 0 && checks.errors.length > 0 ? (
        <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {checks.errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      ) : null}
      <Button type="submit" disabled={loading}>
        {loading ? <Spinner /> : null}
        Reset password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      footer={
        <Link href="/login" className="text-brand underline">
          Back to sign in
        </Link>
      }
    >
      <Suspense fallback={<Spinner />}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
