import { z } from 'zod';

/**
 * Validates process.env at boot. The app refuses to start if anything
 * required is missing or malformed (docs/api-specification.md §4).
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_BASE_URL: z.string().url().default('https://printkaro-b9r0.onrender.com'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_URL_UNPOOLED: z.string().optional(),

    BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET must be at least 16 chars'),
    BETTER_AUTH_URL: z.string().url().default('https://printkaro-b9r0.onrender.com'),
    CUSTOMER_APP_URL: z.string().url().default('http://localhost:3000'),

    // Machine JWT auth
    MACHINE_JWT_SECRET: z.string().min(16, 'MACHINE_JWT_SECRET must be at least 16 chars'),
    MACHINE_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900), // 15m
    MACHINE_JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000), // 30d
    MACHINE_SECRET_PEPPER: z.string().min(8).default('printkaro-dev-pepper'),

    // OAuth (optional — Google enabled only if both present)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // ── Phone OTP (SMS) ──
    // console logs codes to stdout (dev only — production refuses to boot with it).
    SMS_PROVIDER: z.enum(['console', 'msg91', 'twilio']).default('console'),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_TEMPLATE_ID: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    // Programmable Messaging sender: provide EITHER a Messaging Service SID
    // (MG..., recommended) OR a purchased Twilio number (E.164). Twilio only
    // delivers the SMS; Better Auth generates/verifies the OTP.
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    OTP_EXPIRY_SEC: z.coerce.number().int().positive().default(300), // 5m
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    PHONE_EMAIL_DOMAIN: z.string().default('phone.printkaro.app'),

    // Rate limiting
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    // Cache (optional — in-memory fallback if unset)
    REDIS_URL: z.string().optional(),

    // Machine heartbeat / lockout
    MACHINE_HEARTBEAT_STALE_SEC: z.coerce.number().int().positive().default(75),
    MACHINE_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    MACHINE_LOGIN_LOCKOUT_SEC: z.coerce.number().int().positive().default(300),

    // ── Sprint 4: print pipeline ──
    // Cloudflare R2 (optional — Fake in-process storage used when absent).
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.string().url().optional(),
    R2_PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(900), // 15m

    // Uploads
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(104857600), // 100 MB
    FILE_CONVERTER: z.enum(['stub', 'libreoffice']).default('stub'),

    // PIN policy
    PIN_TTL_SEC: z.coerce.number().int().positive().default(21600), // 6h
    PIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

    // Payment (demo only — Razorpay added in Sprint 5)
    PAYMENT_PROVIDER: z.enum(['simulator', 'razorpay']).default('simulator'),

    // Print job queue
    PRINT_JOB_TIMEOUT_SEC: z.coerce.number().int().positive().default(300),
  })
  .superRefine((env, ctx) => {
    // Fail fast on config that would silently break auth in production.
    if (env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_PROVIDER'],
        message:
          'console SMS provider is dev-only. Set SMS_PROVIDER=msg91 (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID) or SMS_PROVIDER=twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER).',
      });
    }
    if (env.SMS_PROVIDER === 'msg91') {
      for (const key of ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SMS_PROVIDER=msg91`,
          });
        }
      }
    }
    if (env.SMS_PROVIDER === 'twilio') {
      for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SMS_PROVIDER=twilio`,
          });
        }
      }
      // Programmable Messaging needs a sender identity. A Verify Service SID
      // (VA...) does NOT work here — you must provision a Messaging Service or
      // a phone number. Require exactly one.
      if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM_NUMBER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TWILIO_MESSAGING_SERVICE_SID'],
          message:
            'SMS_PROVIDER=twilio needs a sender: set TWILIO_MESSAGING_SERVICE_SID (MG...) or TWILIO_FROM_NUMBER (E.164). A Verify Service SID (VA...) will not work.',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  // Treat blank values as unset. Deploy platforms (and .env files) frequently
  // leave optional keys as empty strings (e.g. R2_PUBLIC_URL=); an empty string
  // is "present" to Zod, so `.url().optional()` would reject it instead of
  // skipping it. Coercing "" → undefined makes blank optionals behave as unset
  // while still letting required vars fail with a clear "required" message.
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    normalized[key] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }

  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
