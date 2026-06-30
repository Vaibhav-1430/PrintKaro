import { z } from 'zod';

/**
 * Validates process.env at boot. The app refuses to start if anything
 * required is missing or malformed (docs/api-specification.md §4).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_UNPOOLED: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET must be at least 16 chars'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:4000'),
  CUSTOMER_APP_URL: z.string().url().default('http://localhost:3000'),

  // Machine JWT auth
  MACHINE_JWT_SECRET: z.string().min(16, 'MACHINE_JWT_SECRET must be at least 16 chars'),
  MACHINE_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900), // 15m
  MACHINE_JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000), // 30d
  MACHINE_SECRET_PEPPER: z.string().min(8).default('printkaro-dev-pepper'),

  // OAuth (optional — Google enabled only if both present)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

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
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
