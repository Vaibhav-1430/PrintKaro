import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { ConfigService } from '@nestjs/config';
import { MachineService } from './machine.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { MachineTokenService } from './machine-token.service';

const config = { get: () => '' } as unknown as ConfigService;
const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const tokens = {
  issueTokens: jest.fn().mockResolvedValue({
    accessToken: 'a',
    refreshToken: 'r',
    expiresIn: 900,
    tokenType: 'Bearer',
  }),
} as unknown as MachineTokenService;
const req = { headers: {}, ip: '127.0.0.1', socket: {} } as never;

describe('MachineService.login', () => {
  it('issues tokens for valid credentials', async () => {
    const hash = await argon2.hash('secret');
    const prisma = {
      client: {
        machine: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'm1',
            code: 'PK-1',
            status: 'ACTIVE',
            credential: { secretHash: hash },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      },
    } as unknown as PrismaService;
    const svc = new MachineService(prisma, tokens, audit, config);
    const result = await svc.login('m1', 'secret', req);
    expect(result.accessToken).toBe('a');
  });

  it('rejects an unknown machine (no timing leak path)', async () => {
    const prisma = {
      client: { machine: { findFirst: jest.fn().mockResolvedValue(null) } },
    } as unknown as PrismaService;
    const svc = new MachineService(prisma, tokens, audit, config);
    await expect(svc.login('mX', 'whatever', req)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const hash = await argon2.hash('correct');
    const prisma = {
      client: {
        machine: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'm1',
            code: 'PK-1',
            status: 'ACTIVE',
            credential: { secretHash: hash },
          }),
        },
      },
    } as unknown as PrismaService;
    const svc = new MachineService(prisma, tokens, audit, config);
    await expect(svc.login('m1', 'wrong', req)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a suspended machine', async () => {
    const hash = await argon2.hash('secret');
    const prisma = {
      client: {
        machine: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'm1',
            code: 'PK-1',
            status: 'SUSPENDED',
            credential: { secretHash: hash },
          }),
        },
      },
    } as unknown as PrismaService;
    const svc = new MachineService(prisma, tokens, audit, config);
    await expect(svc.login('m1', 'secret', req)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('MachineService.refresh / logout', () => {
  it('refresh rotates the token and audits', async () => {
    const rotate = jest
      .fn()
      .mockResolvedValue({ tokens: { accessToken: 'a2', refreshToken: 'r2' }, machineId: 'm1' });
    const tokensSvc = { rotateRefreshToken: rotate } as unknown as MachineTokenService;
    const prisma = { client: {} } as unknown as PrismaService;
    const svc = new MachineService(prisma, tokensSvc, audit, config);
    const res = await svc.refresh('raw', req);
    expect(res.accessToken).toBe('a2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MACHINE_TOKEN_REFRESHED' }),
    );
  });

  it('logout revokes all tokens and audits', async () => {
    const revokeAll = jest.fn().mockResolvedValue(undefined);
    const tokensSvc = { revokeAll } as unknown as MachineTokenService;
    const prisma = { client: {} } as unknown as PrismaService;
    const svc = new MachineService(prisma, tokensSvc, audit, config);
    const res = await svc.logout('m1', req);
    expect(res.loggedOut).toBe(true);
    expect(revokeAll).toHaveBeenCalledWith('m1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MACHINE_LOGOUT' }),
    );
  });
});
