/**
 * Auth env resolution. Kept tiny and dependency-free so both the NestJS
 * server and Next.js BFF can import it. Throws early on missing required secrets.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`[auth] Missing required env var: ${name}`);
  }
  return value;
}

function splitOrigins(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[auth] ${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export const authEnv = {
  secret: required('BETTER_AUTH_SECRET', process.env.BETTER_AUTH_SECRET),
  baseURL: process.env.BETTER_AUTH_URL ?? 'https://printkaro-b9r0.onrender.com',
  trustedOrigins: splitOrigins(process.env.CORS_ORIGINS, 'http://localhost:3000'),
  // Where the customer app lives, for building email links.
  customerAppUrl: process.env.CUSTOMER_APP_URL ?? 'http://localhost:3000',
  isProd: process.env.NODE_ENV === 'production',
  // Phone OTP policy (Better Auth phoneNumber plugin).
  otp: {
    expirySeconds: intEnv('OTP_EXPIRY_SEC', 300),
    maxAttempts: intEnv('OTP_MAX_ATTEMPTS', 3),
    // Phone-only accounts still need a unique email column value; Better Auth
    // synthesises one under this domain. Never used for delivery.
    phoneEmailDomain: process.env.PHONE_EMAIL_DOMAIN ?? 'phone.printkaro.app',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    get enabled(): boolean {
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    },
  },
};
