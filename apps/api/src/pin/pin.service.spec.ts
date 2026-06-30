import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PIN_STATUSES } from '@print-karo/types';
import { PinService } from './pin.service';
import type { PinRepository } from './pin.repository';
import type { AuditService } from '../audit/audit.service';
import type { CacheService } from '../cache/cache.service';

function make() {
  const repo = {
    create: jest.fn().mockResolvedValue({ id: 'pin-1' }),
    findByOrderId: jest.fn(),
    findActiveForMachine: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    incrementAttempts: jest.fn(),
    listActive: jest.fn(),
  } as unknown as PinRepository;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const cache = { del: jest.fn().mockResolvedValue(undefined) } as unknown as CacheService;
  const config = {
    get: (k: string, d: unknown) => (k === 'MACHINE_SECRET_PEPPER' ? 'pep' : d),
  } as unknown as ConfigService;
  const svc = new PinService(repo, audit, cache, config);
  return { svc, repo, audit, cache };
}

describe('PinService.mint', () => {
  it('creates a hashed PIN row and returns the plaintext once', async () => {
    const { svc, repo, audit } = make();
    const result = await svc.mint('o1', 'm1');
    expect(result.pin).toMatch(/^\d{4}$/);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o1', machineId: 'm1', status: PIN_STATUSES.ACTIVE }),
    );
    // The stored codeHash must not equal the plaintext.
    const createArg = (repo.create as jest.Mock).mock.calls[0][0];
    expect(createArg.codeHash).not.toBe(result.pin);
    expect(audit.record).toHaveBeenCalled();
  });
});

describe('PinService.redeem', () => {
  it('redeems a matching active PIN and returns the order', async () => {
    const { svc, repo } = make();
    const hash = await argon2.hash('1234' + 'pep');
    (repo.findActiveForMachine as jest.Mock).mockResolvedValue([
      {
        id: 'pin-1',
        orderId: 'o1',
        codeHash: hash,
        status: PIN_STATUSES.ACTIVE,
        attempts: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);
    const res = await svc.redeem('m1', '1234');
    expect(res.orderId).toBe('o1');
    expect(repo.update).toHaveBeenCalledWith(
      'pin-1',
      expect.objectContaining({ status: PIN_STATUSES.REDEEMED }),
    );
  });

  it('rejects an invalid PIN and burns an attempt', async () => {
    const { svc, repo } = make();
    const hash = await argon2.hash('9999' + 'pep');
    (repo.findActiveForMachine as jest.Mock).mockResolvedValue([
      {
        id: 'pin-1',
        orderId: 'o1',
        codeHash: hash,
        status: PIN_STATUSES.ACTIVE,
        attempts: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);
    (repo.incrementAttempts as jest.Mock).mockResolvedValue({
      id: 'pin-1',
      orderId: 'o1',
      attempts: 1,
      maxAttempts: 3,
    });
    await expect(svc.redeem('m1', '1234')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.incrementAttempts).toHaveBeenCalledWith('pin-1');
  });

  it('revokes the PIN after the final failed attempt', async () => {
    const { svc, repo } = make();
    const hash = await argon2.hash('9999' + 'pep');
    (repo.findActiveForMachine as jest.Mock).mockResolvedValue([
      {
        id: 'pin-1',
        orderId: 'o1',
        codeHash: hash,
        status: PIN_STATUSES.ACTIVE,
        attempts: 2,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);
    (repo.incrementAttempts as jest.Mock).mockResolvedValue({
      id: 'pin-1',
      orderId: 'o1',
      attempts: 3,
      maxAttempts: 3,
    });
    await expect(svc.redeem('m1', '1234')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.update).toHaveBeenCalledWith('pin-1', { status: PIN_STATUSES.REVOKED });
  });

  it('throws Forbidden when the right code is presented but the PIN is expired', async () => {
    const { svc, repo } = make();
    const hash = await argon2.hash('1234' + 'pep');
    (repo.findActiveForMachine as jest.Mock).mockResolvedValue([
      {
        id: 'pin-1',
        orderId: 'o1',
        codeHash: hash,
        status: PIN_STATUSES.ACTIVE,
        attempts: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() - 1),
      },
    ]);
    await expect(svc.redeem('m1', '1234')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PinService.expire', () => {
  it('expires an active PIN', async () => {
    const { svc, repo } = make();
    (repo.findByOrderId as jest.Mock).mockResolvedValue({
      id: 'pin-1',
      status: PIN_STATUSES.ACTIVE,
    });
    await svc.expire('o1');
    expect(repo.update).toHaveBeenCalledWith('pin-1', { status: PIN_STATUSES.EXPIRED });
  });

  it('is a no-op when there is no active PIN', async () => {
    const { svc, repo } = make();
    (repo.findByOrderId as jest.Mock).mockResolvedValue(null);
    await svc.expire('o1');
    expect(repo.update).not.toHaveBeenCalled();
  });
});
