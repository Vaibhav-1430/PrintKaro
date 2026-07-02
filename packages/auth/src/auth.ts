import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { phoneNumber } from 'better-auth/plugins';
import { prisma } from '@print-karo/database';
import { authEnv } from './env';
import { ConsoleEmailSender, type EmailSender } from './email-sender';
import { ConsoleSmsSender, type SmsSender } from './sms-sender';

/** Strict E.164: +, country code, 8–15 digits total. */
const E164_RE = /^\+[1-9]\d{7,14}$/;

/**
 * Hooks the host app (NestJS) can supply to react to auth events — used for
 * audit logging and provisioning the customer profile on first sign-up.
 */
export interface AuthHooks {
  emailSender?: EmailSender;
  smsSender?: SmsSender;
  onUserCreated?: (user: {
    id: string;
    email: string;
    phoneNumber?: string | null;
  }) => Promise<void> | void;
  onSignInSuccess?: (user: { id: string; email: string }) => Promise<void> | void;
  /** An OTP was generated and handed to the SMS provider. */
  onPhoneOtpSent?: (info: { phoneNumber: string }) => Promise<void> | void;
  /** A phone number was successfully verified (customer signed in / created). */
  onPhoneVerified?: (info: { userId: string; phoneNumber: string }) => Promise<void> | void;
}

/**
 * Build a fully-configured Better Auth instance.
 *
 * Identity model:
 *  - CUSTOMERS authenticate with phone number + SMS OTP only (phoneNumber
 *    plugin). First successful verification creates the account; no passwords,
 *    no email verification. A synthetic, undeliverable email is stored to
 *    satisfy the unique email column.
 *  - STAFF (admin/operator) authenticate with email + password. Public HTTP
 *    sign-up for email/password is blocked at the API layer; staff accounts
 *    are created server-side via auth.api.signUpEmail.
 *
 * Humans get secure, HttpOnly session cookies (browser-native, CSRF-safe,
 * server-revocable). Machine JWT auth is handled separately by the API.
 */
export function createAuth(hooks: AuthHooks = {}) {
  const emailSender = hooks.emailSender ?? new ConsoleEmailSender();
  const smsSender = hooks.smsSender ?? new ConsoleSmsSender();

  const options: BetterAuthOptions = {
    appName: 'Print Karo',
    secret: authEnv.secret,
    baseURL: authEnv.baseURL,
    basePath: '/api/auth',
    trustedOrigins: authEnv.trustedOrigins,

    database: prismaAdapter(prisma, { provider: 'postgresql' }),

    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: authEnv.otp.expirySeconds,
        // Wrong-code attempts allowed before the OTP is invalidated
        // (brute-force protection; combined with send/verify rate limits below).
        allowedAttempts: authEnv.otp.maxAttempts,
        requireVerification: true,
        phoneNumberValidator: (value) => E164_RE.test(value),
        sendOTP: async ({ phoneNumber: to, code }) => {
          await smsSender.sendOtp({
            phoneNumber: to,
            code,
            expiresInSeconds: authEnv.otp.expirySeconds,
          });
          await hooks.onPhoneOtpSent?.({ phoneNumber: to });
        },
        callbackOnVerification: async ({ phoneNumber: verified, user }) => {
          if (user) {
            await hooks.onPhoneVerified?.({ userId: user.id, phoneNumber: verified });
          }
        },
        signUpOnVerification: {
          // Unique, undeliverable placeholder — the email column is NOT NULL
          // UNIQUE. Customers never see or use it.
          getTempEmail: (phone) => `${phone.replace(/\D/g, '')}@${authEnv.otp.phoneEmailDomain}`,
          getTempName: (phone) => phone,
        },
      }),
    ],

    // Better Auth's own per-path rate limiting (per client IP), on top of the
    // API's global throttler. OTP endpoints are the tightest: they cost money
    // and are the brute-force surface.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/phone-number/send-otp': { window: 60, max: 3 },
        '/phone-number/verify': { window: 60, max: 6 },
        '/sign-in/email': { window: 60, max: 10 },
      },
    },

    // Staff-only (admin/operator). Customer sign-up via this method is blocked
    // publicly by the API's auth handler.
    emailAndPassword: {
      enabled: true,
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
      sendOnSignUp: false,
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
        // The customer app (Netlify) and the API (Render) are cross-site, so
        // production cookies need SameSite=None; browsers neither store nor
        // send Lax cookies across sites. None requires Secure (HTTPS-only).
        // Dev stays Lax: everything runs on localhost (same-site, no HTTPS).
        sameSite: authEnv.isProd ? 'none' : 'lax',
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
            const record = user as typeof user & { phoneNumber?: string | null };
            await hooks.onUserCreated?.({
              id: user.id,
              email: user.email,
              phoneNumber: record.phoneNumber ?? null,
            });
          },
        },
      },
    },
  };

  return betterAuth(options);
}

/** Default instance (console email/SMS senders) — used by the Better Auth CLI/types. */
export const auth = createAuth();

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth['$Infer']['Session'];
