/**
 * Enterprise password policy (Sprint 2).
 * - >= 12 chars, upper + lower + number + special.
 * - Rejects a blocklist of common/leaked passwords.
 * Pure & dependency-free so FE and BE validate identically.
 */
export const PASSWORD_MIN_LENGTH = 12;

// Small built-in blocklist. In production this is augmented by a leaked-password
// check (e.g. HaveIBeenPwned k-anonymity range API) on the server.
export const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty',
  'qwerty123',
  'admin',
  'administrator',
  'letmein',
  'welcome',
  'welcome1',
  'iloveyou',
  '12345678',
  '123456789',
  '1234567890',
  'changeme',
  'printkaro',
  'printkaro123',
]);

export interface PasswordCheckResult {
  valid: boolean;
  errors: string[];
}

export function checkPasswordStrength(password: string): PasswordCheckResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number.');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain a special character.');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('This password is too common. Choose a stronger one.');
  }

  return { valid: errors.length === 0, errors };
}

export function isStrongPassword(password: string): boolean {
  return checkPasswordStrength(password).valid;
}
