import { ConflictException } from '@nestjs/common';
import { MACHINE_TYPES, type RegisterMachineInput } from '@print-karo/types';
import { MachineRegistrationService } from './machine-registration.service';
import type { MachineRepository } from './machine.repository';
import type { AuditService } from '../audit/audit.service';
import type { ConfigService } from '@nestjs/config';
import type { AuthPrincipal } from '../rbac/auth-context';

const actor = { userId: 'admin1' } as AuthPrincipal;
const req = { headers: {}, ip: '127.0.0.1', socket: {} } as never;
const config = { get: () => '' } as unknown as ConfigService;

const input: RegisterMachineInput = {
  name: 'Lobby PC',
  code: 'PK-DEL-001',
  type: MACHINE_TYPES.WINDOWS,
  colorSupport: true,
  duplexSupport: false,
  paperSizes: ['A4'],
};

describe('MachineRegistrationService', () => {
  it('rejects a duplicate code', async () => {
    const repo = {
      findByCode: jest.fn().mockResolvedValue({ id: 'existing' }),
    } as unknown as MachineRepository;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const svc = new MachineRegistrationService(repo, audit, config);
    await expect(svc.register(actor, input, req)).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a machine, returns a one-time secret, and audits', async () => {
    const repo = {
      findByCode: jest.fn().mockResolvedValue(null),
      createMachine: jest
        .fn()
        .mockResolvedValue({ id: 'm-new', code: 'PK-DEL-001', type: 'WINDOWS' }),
    } as unknown as MachineRepository;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const svc = new MachineRegistrationService(repo, audit, config);

    const result = await svc.register(actor, input, req);

    expect(result.code).toBe('PK-DEL-001');
    expect(result.machineSecret).toHaveLength(43); // base64url of 32 bytes
    expect(repo.createMachine).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PK-DEL-001',
        credential: { create: { secretHash: expect.stringContaining('$argon2') } },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MACHINE_REGISTERED' }),
    );
  });
});
