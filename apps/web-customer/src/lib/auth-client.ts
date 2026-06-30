import { createAuthClient } from 'better-auth/react';
import { env } from './env';

/**
 * Browser Better Auth client. Talks to the NestJS server's mounted handler at
 * <api>/api/auth. Cookies are HttpOnly and managed by the server.
 */
export const authClient = createAuthClient({
  baseURL: `${env.apiBaseUrl}/api/auth`,
  fetchOptions: { credentials: 'include' },
});

export const { signIn, signUp, signOut, useSession } = authClient;
