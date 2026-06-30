import { z } from 'zod';

/**
 * PIN domain (Sprint 4). A 4-digit one-time code unlocks printing at the
 * machine. Only the argon2id hash is ever stored; the plaintext is shown to the
 * customer once and entered at the machine keypad.
 */

export const PIN_STATUSES = {
  ACTIVE: 'ACTIVE',
  REDEEMED: 'REDEEMED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;
export type PinStatus = (typeof PIN_STATUSES)[keyof typeof PIN_STATUSES];

/** Default policy (also enforced server-side from env). */
export const PIN_TTL_SEC = 21_600; // 6 hours
export const PIN_MAX_ATTEMPTS = 3;
export const PIN_LENGTH = 4;

// ── Redeem a PIN (machine-authenticated, at the machine keypad) ───────
export const redeemPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits.'),
});
export type RedeemPinInput = z.infer<typeof redeemPinSchema>;

// ── Response DTOs ────────────────────────────────────────────────────

/** Returned to the customer when a PIN is minted (the plaintext, shown once). */
export interface PinMintResult {
  pin: string;
  expiresAt: string;
}

/** Customer-facing PIN status (never includes the plaintext after mint). */
export interface PinResponse {
  status: PinStatus;
  expiresAt: string;
  attemptsRemaining: number;
}

/** Admin view of an active PIN (no plaintext, no hash). */
export interface ActivePinResponse {
  orderId: string;
  orderNumber: string;
  machineId: string;
  status: PinStatus;
  attemptsRemaining: number;
  expiresAt: string;
}
