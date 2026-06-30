import { createAuthClient } from 'better-auth/react';

/**
 * Browser auth client factory for the Next.js apps.
 * Each app calls this with its API base URL (the NestJS server mounts
 * the Better Auth handler under /api/auth).
 */
export function createPrintKaroAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL: `${baseURL}/api/auth`,
  });
}

export type PrintKaroAuthClient = ReturnType<typeof createPrintKaroAuthClient>;
