import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@print-karo/database';
import { authEnv } from './env';
import { ConsoleEmailSender, type EmailSender } from './email-sender';

/**
 * Hooks the host app (NestJS) can supply to react to auth events — used for
 * audit logging and provisioning the customer profile on first sign-up.
 */
export interface AuthHooks {
  emailSender?: EmailSender;
  onUserCreated?: (user: { id: string; email: string }) => Promise<void> | void;
  onSignInSuccess?: (user: { id: string; email: string }) => Promise<void> | void;
}

/**
 * Build a fully-configured Better Auth instance.
 *
 * Humans authenticate here via secure, HttpOnly session cookies (browser-native,
 * CSRF-safe, server-revocable). Machine JWT auth is handled separately by the API.
 */
export function createAuth(hooks: AuthHooks = {}) {
  const emailSender = hooks.emailSender ?? new ConsoleEmailSender();

  const options: BetterAuthOptions = {
    appName: 'Print Karo',
    secret: authEnv.secret,
    baseURL: authEnv.baseURL,
    basePath: '/api/auth',
    trustedOrigins: authEnv.trustedOrigins,

    database: prismaAdapter(prisma, { provider: 'postgresql' }),

    emailAndPassword: {
      enabled: true,
      // Email verification is required to reach protected routes (enforced in
      // the API's guards via the user.emailVerified flag).
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      sendResetPassword: async ({ user, url }) => {
        await emailSender.send({
          to: user.email,
          subject: 'Reset your Print Karo password',
          text: `Reset your password using this link: ${url}`,
          url,
          kind: 'reset-password',
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await emailSender.send({
          to: user.email,
          subject: 'Verify your Print Karo email',
          text: `Verify your email using this link: ${url}`,
          url,
          kind: 'verify-email',
        });
      },
    },

    socialProviders: authEnv.google.enabled
      ? {
          google: {
            clientId: authEnv.google.clientId,
            clientSecret: authEnv.google.clientSecret,
          },
        }
      : {},

    // Link a Google sign-in to an existing email/password account safely
    // (no duplicate users) when the verified email matches.
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google'],
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // sliding refresh, daily
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },

    advanced: {
      cookiePrefix: 'printkaro',
      useSecureCookies: authEnv.isProd,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: authEnv.isProd,
      },
    },

    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'CUSTOMER',
          input: false,
        },
        status: {
          type: 'string',
          required: false,
          defaultValue: 'ACTIVE',
          input: false,
        },
        isActive: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await hooks.onUserCreated?.({ id: user.id, email: user.email });
          },
        },
      },
    },
  };

  return betterAuth(options);
}

/** Default instance (console email sender) — used by the Better Auth CLI/types. */
export const auth = createAuth();

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth['$Infer']['Session'];
