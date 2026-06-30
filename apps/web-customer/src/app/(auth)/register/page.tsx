'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, Button, Spinner } from '@print-karo/ui';
import { registerSchema, checkPasswordStrength } from '@print-karo/types';
import { AuthShell } from '../../../components/auth-shell';
import { TextField } from '../../../components/field';
import { signUp } from '../../../lib/auth-client';

export default function RegisterPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState('');

  const pwChecks = checkPasswordStrength(password);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    const form = new FormData(e.currentTarget);
    const parsed = registerSchema.safeParse({
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }

    setLoading(true);
    const { error } = await signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (error) {
      setFormError(error.message ?? 'Could not create account.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthShell title="Check your inbox" subtitle="One more step to finish">
        <Alert variant="success">
          We sent a verification link to your email. Click it to activate your account.
        </Alert>
        <Link href="/login" className="text-brand text-sm underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start printing anywhere"
      footer={
        <span>
          Already have an account?{' '}
          <Link href="/login" className="text-brand underline">
            Sign in
          </Link>
        </span>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <TextField
          id="name"
          name="name"
          label="Full name"
          autoComplete="name"
          error={errors.name}
          required
        />
        <TextField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          error={errors.email}
          required
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />
        {password.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs">
            {pwChecks.errors.length === 0 ? (
              <li className="text-success">Strong password ✓</li>
            ) : (
              pwChecks.errors.map((err) => (
                <li key={err} className="text-muted-foreground">
                  • {err}
                </li>
              ))
            )}
          </ul>
        ) : null}
        <Button type="submit" disabled={loading}>
          {loading ? <Spinner /> : null}
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
