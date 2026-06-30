import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  AUDIT_ACTIONS,
  PIN_STATUSES,
  type ActivePinResponse,
  type PinMintResult,
  type PinResponse,
} from '@print-karo/types';
import { PinRepository } from './pin.repository';
import { attemptsRemaining, canRedeem, generatePin } from './pin-policy';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../cache/cache.service';

export interface PinRedemption {
  orderId: string;
  pinId: string;
}

/**
 * PIN minting + redemption. The plaintext is generated with a CSPRNG, hashed
 * with argon2id (peppered like machine secrets) and stored hash-only. Redemption
 * happens at the machine: it verifies the code against active PINs for that
 * machine, enforces attempts/expiry/one-time, and returns the unlocked order.
 *
 * Note: redeem only validates + flips the PIN; the OrderService performs the
 * order transition + job dispatch (keeps this module dependency-free).
 */
@Injectable()
export class PinService {
  constructor(
    private readonly repo: PinRepository,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  private get pepper(): string {
    return this.config.get<string>('MACHINE_SECRET_PEPPER', '');
  }

  private get ttlSec(): number {
    return this.config.get<number>('PIN_TTL_SEC', 21_600);
  }

  private get maxAttempts(): number {
    return this.config.get<number>('PIN_MAX_ATTEMPTS', 3);
  }

  /** Mint a fresh PIN for a paid order. Returns the plaintext exactly once. */
  async mint(orderId: string, machineId: string): Promise<PinMintResult> {
    const pin = generatePin();
    const codeHash = await argon2.hash(pin + this.pepper);
    const expiresAt = new Date(Date.now() + this.ttlSec * 1000);

    await this.repo.create({
      orderId,
      machineId,
      codeHash,
      status: PIN_STATUSES.ACTIVE,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      expiresAt,
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.PIN_GENERATED,
      actorType: 'SYSTEM',
      targetType: 'Order',
      targetId: orderId,
      metadata: { machineId },
    });

    return { pin, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Redeem a PIN at the calling machine. Verifies against that machine's active
   * PINs, increments attempts on mismatch (locking after max), and on success
   * flips the PIN to REDEEMED. Returns the unlocked order for the caller to
   * dispatch. Throws Unauthorized on bad/locked/expired PINs.
   */
  async redeem(machineId: string, pin: string): Promise<PinRedemption> {
    const candidates = await this.repo.findActiveForMachine(machineId);

    for (const candidate of candidates) {
      const ok = await argon2.verify(candidate.codeHash, pin + this.pepper).catch(() => false);
      if (!ok) continue;

      // Right code — enforce attempts/expiry one more time (race-safe).
      if (!canRedeem(candidate)) {
        throw new ForbiddenException('PIN is no longer valid.');
      }

      await this.repo.update(candidate.id, {
        status: PIN_STATUSES.REDEEMED,
        redeemedAt: new Date(),
      });
      await this.cache.del(this.attemptKey(machineId));
      await this.audit.record({
        action: AUDIT_ACTIONS.PIN_REDEEMED,
        actorType: 'MACHINE',
        actorMachineId: machineId,
        targetType: 'Order',
        targetId: candidate.orderId,
      });
      return { orderId: candidate.orderId, pinId: candidate.id };
    }

    // No active PIN matched. Count the failed attempt against every candidate so
    // a brute-force attempt burns down the real PIN's attempt budget.
    await this.registerFailure(
      machineId,
      candidates.map((c) => c.id),
    );
    throw new UnauthorizedException('Invalid PIN.');
  }

  /** Expire (revoke) an order's PIN — e.g. after a successful print. */
  async expire(orderId: string): Promise<void> {
    const pin = await this.repo.findByOrderId(orderId);
    if (!pin || pin.status !== PIN_STATUSES.ACTIVE) return;
    await this.repo.update(pin.id, { status: PIN_STATUSES.EXPIRED });
    await this.audit.record({
      action: AUDIT_ACTIONS.PIN_EXPIRED,
      actorType: 'SYSTEM',
      targetType: 'Order',
      targetId: orderId,
    });
  }

  /** Customer-facing PIN status for an order. */
  async statusFor(orderId: string): Promise<PinResponse | null> {
    const pin = await this.repo.findByOrderId(orderId);
    if (!pin) return null;
    return {
      status: pin.status,
      expiresAt: pin.expiresAt.toISOString(),
      attemptsRemaining: attemptsRemaining(pin),
    };
  }

  /** Admin view of all active PINs across the fleet. */
  async listActive(): Promise<ActivePinResponse[]> {
    const pins = await this.repo.listActive();
    return pins.map((p) => ({
      orderId: p.orderId,
      orderNumber: p.order.orderNumber,
      machineId: p.machineId,
      status: p.status,
      attemptsRemaining: attemptsRemaining(p),
      expiresAt: p.expiresAt.toISOString(),
    }));
  }

  private attemptKey(machineId: string): string {
    return `pin:attempts:${machineId}`;
  }

  private async registerFailure(machineId: string, candidateIds: string[]): Promise<void> {
    for (const id of candidateIds) {
      const updated = await this.repo.incrementAttempts(id);
      if (updated.attempts >= updated.maxAttempts) {
        await this.repo.update(id, { status: PIN_STATUSES.REVOKED });
        await this.audit.record({
          action: AUDIT_ACTIONS.PIN_FAILED,
          actorType: 'MACHINE',
          actorMachineId: machineId,
          targetType: 'Order',
          targetId: updated.orderId,
          metadata: { reason: 'max_attempts_exceeded' },
        });
      }
    }
  }
}
