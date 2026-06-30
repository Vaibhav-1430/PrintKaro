'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@print-karo/ui';
import { loginSchema } from '@print-karo/types';
import { TextField } from '../../../components/field';
import { ThemeToggle } from '../../../components/theme-toggle';
import { signIn } from '../../../lib/auth-client';

/**
 * Unified staff login. Admin, Super Admin and Operator all authenticate here;
 * their role (and therefore what they can do) is resolved from the database
 * server-side — the UI does not hardcode role-based entry points.
 */
export default function AdminLoginPage() {
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
    });
    setLoading(false);

    if (error) {
      setFormError(error.message ?? 'Invalid credentials.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="bg-muted/30 flex min-h-screen flex-col">
      <header className="flex items-center justify-between p-4">
        <span className="text-brand text-lg font-bold">Print Karo Admin</span>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Staff sign in</CardTitle>
            <p className="text-muted-foreground text-sm">Admin · Super Admin · Operator</p>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              {formError ? <Alert variant="error">{formError}</Alert> : null}
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
                autoComplete="current-password"
                error={errors.password}
                required
              />
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner /> : null}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
