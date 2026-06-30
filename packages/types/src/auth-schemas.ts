import { z } from 'zod';
import { isStrongPassword } from './password-policy';
import { ROLES } from './roles';

/** Reusable field validators. */
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');

export const strongPasswordSchema = z.string().refine(isStrongPassword, {
  message:
    'Password must be 12+ chars with uppercase, lowercase, number and special character, and not be common.',
});

// ── Customer / human auth ────────────────────────────────────────────

export const registerSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  name: z.string().trim().min(1, 'Name is required.').max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: strongPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required.'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, 'Enter a valid phone number.')
    .optional(),
  defaultCity: z.string().trim().max(120).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ── Admin / operator creation (staff) ────────────────────────────────

export const createAdminSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: strongPasswordSchema,
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const createOperatorSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: strongPasswordSchema,
  businessName: z.string().trim().min(1).max(160),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, 'Enter a valid phone number.')
    .optional(),
});
export type CreateOperatorInput = z.infer<typeof createOperatorSchema>;

// ── Machine auth ─────────────────────────────────────────────────────

export const machineLoginSchema = z.object({
  machineId: z.string().min(1, 'Machine ID is required.'),
  machineSecret: z.string().min(1, 'Machine secret is required.'),
});
export type MachineLoginInput = z.infer<typeof machineLoginSchema>;

export const machineRefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.'),
});
export type MachineRefreshInput = z.infer<typeof machineRefreshSchema>;

// ── Response shapes ──────────────────────────────────────────────────

export const userRoleSchema = z.nativeEnum(ROLES);

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: keyof typeof ROLES;
  emailVerified: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
}

export interface SessionInfo {
  id: string;
  current: boolean;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  country: string | null;
  lastActivityAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface MachineTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}
