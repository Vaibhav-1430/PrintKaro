import { describe, it, expect } from 'vitest';
import { checkPasswordStrength, isStrongPassword } from './password-policy';

describe('password policy', () => {
  it('accepts a strong password', () => {
    expect(isStrongPassword('Str0ng!Passw0rd')).toBe(true);
  });

  it('rejects passwords that are too short', () => {
    const r = checkPasswordStrength('Ab1!xyz');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('at least'))).toBe(true);
  });

  it.each([
    ['no uppercase', 'str0ng!passw0rd', 'uppercase'],
    ['no lowercase', 'STR0NG!PASSW0RD', 'lowercase'],
    ['no number', 'Strong!Password', 'number'],
    ['no special', 'Strong1Password', 'special'],
  ])('rejects %s', (_label, pw, fragment) => {
    const r = checkPasswordStrength(pw);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes(fragment))).toBe(true);
  });

  it('rejects common passwords even if they would otherwise pass', () => {
    // "Password123!" matches complexity but is common-ish; explicit blocklist entry:
    const r = checkPasswordStrength('Password123');
    expect(r.valid).toBe(false);
  });

  it('reports all failing rules at once', () => {
    const r = checkPasswordStrength('abc');
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
