import { validateEnv } from './env.schema';

/** Minimal set of required vars so the schema can parse. */
const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  BETTER_AUTH_SECRET: '0123456789abcdef0123',
  MACHINE_JWT_SECRET: '0123456789abcdef0123',
};

describe('validateEnv', () => {
  it('accepts a minimal valid config with sensible defaults', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.SMS_PROVIDER).toBe('console');
  });

  it('treats a blank optional URL as unset instead of rejecting it', () => {
    // Regression: R2_PUBLIC_URL='' (a common deploy/.env value) used to fail
    // `.url().optional()` and crash boot. Blank optionals must behave as unset.
    expect(() => validateEnv({ ...base, R2_PUBLIC_URL: '' })).not.toThrow();
    const env = validateEnv({ ...base, R2_PUBLIC_URL: '   ' });
    expect(env.R2_PUBLIC_URL).toBeUndefined();
  });

  it('still honours a real optional URL when provided', () => {
    const env = validateEnv({ ...base, R2_PUBLIC_URL: 'https://cdn.example.com' });
    expect(env.R2_PUBLIC_URL).toBe('https://cdn.example.com');
  });

  it('fails a required var left blank, with a clear message', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('refuses the console SMS provider in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', SMS_PROVIDER: 'console' })).toThrow(
      /SMS_PROVIDER/,
    );
  });
});
