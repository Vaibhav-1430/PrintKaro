'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@print-karo/ui';
import { createOperatorSchema } from '@print-karo/types';
import { TextField } from '../../../../components/field';
import { api } from '../../../../lib/api';

export default function NewOperatorPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setCreated(null);
    const form = new FormData(e.currentTarget);
    const parsed = createOperatorSchema.safeParse({
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
      businessName: form.get('businessName'),
      contactPhone: form.get('contactPhone') || undefined,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setLoading(true);
    try {
      const res = await api.createOperator(parsed.data);
      setCreated(res.email);
      e.currentTarget.reset();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create operator.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <Link href="/" className="text-brand text-sm underline">
        ← Back to dashboard
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Create operator</CardTitle>
          <p className="text-muted-foreground text-sm">Admin or Super Admin.</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            {formError ? <Alert variant="error">{formError}</Alert> : null}
            {created ? <Alert variant="success">Operator created: {created}</Alert> : null}
            <TextField id="name" name="name" label="Contact name" error={errors.name} required />
            <TextField
              id="businessName"
              name="businessName"
              label="Business name"
              error={errors.businessName}
              required
            />
            <TextField
              id="email"
              name="email"
              type="email"
              label="Email"
              error={errors.email}
              required
            />
            <TextField
              id="contactPhone"
              name="contactPhone"
              label="Contact phone (optional)"
              error={errors.contactPhone}
            />
            <TextField
              id="password"
              name="password"
              type="password"
              label="Temporary password"
              autoComplete="new-password"
              error={errors.password}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner /> : null}
              Create operator
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
