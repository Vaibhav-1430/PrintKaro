'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Spinner,
} from '@print-karo/ui';
import type { AuthUser } from '@print-karo/types';
import { TextField } from '../../../components/field';
import { ThemeToggle } from '../../../components/theme-toggle';
import { api } from '../../../lib/api';
import { signOut } from '../../../lib/auth-client';

type Profile = AuthUser & { phone?: string | null };

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then(setProfile)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const updated = await api.updateProfile({
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? '') || undefined,
      });
      setProfile((p) => (p ? { ...p, ...updated } : p));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <div className="flex items-center gap-2">
          <Link href="/sessions" className="text-brand text-sm underline">
            Sessions
          </Link>
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              router.push('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : profile ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{profile.email}</span>
                {profile.emailVerified ? (
                  <Badge variant="success">Verified</Badge>
                ) : (
                  <Badge variant="warning">Unverified</Badge>
                )}
                <Badge variant="muted">{profile.role}</Badge>
              </div>
              <form className="flex flex-col gap-4" onSubmit={onSave}>
                {error ? <Alert variant="error">{error}</Alert> : null}
                {saved ? <Alert variant="success">Profile saved.</Alert> : null}
                <TextField
                  id="name"
                  name="name"
                  label="Full name"
                  defaultValue={profile.name ?? ''}
                />
                <TextField
                  id="phone"
                  name="phone"
                  label="Phone"
                  defaultValue={profile.phone ?? ''}
                />
                <Button type="submit" disabled={saving}>
                  {saving ? <Spinner /> : null}
                  Save changes
                </Button>
              </form>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
