'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Spinner } from '@print-karo/ui';
import { loginSchema } from '@print-karo/types';
import { AuthShell } from '../../../components/auth-shell';
import { TextField } from '../../../components/field';
import { signIn } from '../../../lib/auth-client';
import { env } from '../../../lib/env';

export default function LoginPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }

    setLoading(true);
    const { error } = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
      callbackURL: env.apiBaseUrl,
    });
    setLoading(false);

    if (error) {
      setFormError(error.message ?? 'Invalid email or password.');
      return;
    }
    router.push('/profile');
    router.refresh();
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Print Karo account"
      footer={
        <span>
          New here?{' '}
          <Link href="/register" className="text-brand underline">
            Create an account
          </Link>
        </span>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <TextField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
          required
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          error={errors.password}
          required
        />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-brand text-xs underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Spinner /> : null}
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
