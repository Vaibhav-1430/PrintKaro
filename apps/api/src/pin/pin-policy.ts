import { randomInt } from 'node:crypto';
import { PIN_LENGTH, PIN_STATUSES, type PinStatus } from '@print-karo/types';

/**
 * Pure PIN policy helpers — no I/O, no DI, fully unit-testable. The PIN itself
 * is generated with a CSPRNG; everything else is a deterministic predicate over
 * a PIN's state used by both the service and the tests.
 */

/** A cryptographically-random zero-padded 4-digit code. */
export function generatePin(): string {
  const max = 10 ** PIN_LENGTH; // 10000
  return randomInt(0, max).toString().padStart(PIN_LENGTH, '0');
}

export interface PinState {
  status: PinStatus;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
}

export function isExpired(pin: Pick<PinState, 'expiresAt'>, now: Date = new Date()): boolean {
  return pin.expiresAt.getTime() <= now.getTime();
}

export function attemptsRemaining(pin: Pick<PinState, 'attempts' | 'maxAttempts'>): number {
  return Math.max(0, pin.maxAttempts - pin.attempts);
}

/** A PIN can be redeemed only while ACTIVE, not expired, and with attempts left. */
export function canRedeem(pin: PinState, now: Date = new Date()): boolean {
  return pin.status === PIN_STATUSES.ACTIVE && !isExpired(pin, now) && attemptsRemaining(pin) > 0;
}
