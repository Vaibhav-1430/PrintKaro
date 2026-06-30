import { createAuthClient } from 'better-auth/react';
import { env } from './env';

export const authClient = createAuthClient({
  baseURL: `${env.apiBaseUrl}/api/auth`,
  fetchOptions: { credentials: 'include' },
});

export const { signIn, signOut, useSession } = authClient;
