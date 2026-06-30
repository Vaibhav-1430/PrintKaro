'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@print-karo/ui';
import { ROLES, type AuthUser } from '@print-karo/types';
import { ThemeToggle } from '../components/theme-toggle';
import { api } from '../lib/api';
import { signOut } from '../lib/auth-client';

export default function AdminHome() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const canCreateOperator = isSuperAdmin || user?.role === ROLES.ADMIN;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin dashboard</h1>
        <div className="flex items-center gap-2">
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
          <CardTitle>Signed in</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-6 w-48" />
          ) : user ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <Badge variant="default">{user.role}</Badge>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create operator</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">Provision a franchise operator account.</p>
            <Link href="/operators/new">
              <Button disabled={!canCreateOperator}>New operator</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create admin</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">Super admin only.</p>
            <Link href="/admins/new">
              <Button disabled={!isSuperAdmin}>New admin</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Machines</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Register and monitor the vending-machine fleet.
            </p>
            <Link href="/machines">
              <Button>View fleet</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders &amp; revenue</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Track orders, revenue, active PINs and refunds.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/orders">
                <Button size="sm">Orders</Button>
              </Link>
              <Link href="/revenue">
                <Button size="sm" variant="outline">
                  Revenue
                </Button>
              </Link>
              <Link href="/pins">
                <Button size="sm" variant="outline">
                  PINs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">Configure per-machine pricing rules.</p>
            <Link href="/pricing">
              <Button disabled={!isSuperAdmin}>Manage pricing</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
