import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ROLES } from '@print-karo/types';
import { MachineManagementService } from './machine-management.service';
import type { MachineRepository } from './machine.repository';
import type { MachineLogsService } from './machine-logs.service';
import type { MachineGateway } from './machine.gateway';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthPrincipal } from '../rbac/auth-context';

const req = { headers: {}, ip: '127.0.0.1', socket: {} } as never;
const admin: AuthPrincipal = { userId: 'a1', role: ROLES.ADMIN } as AuthPrincipal;
const operator: AuthPrincipal = { userId: 'op1', role: ROLES.OPERATOR } as AuthPrincipal;

function deps(overrides: Partial<Record<string, unknown>> = {}) {
  const repo = {
    findFullById: jest.fn(),
    updateMachine: jest.fn().mockResolvedValue({}),
    listMachines: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as MachineRepository;
  const logs = {
    recordServerEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as MachineLogsService;
  const gateway = { emitStateChange: jest.fn() } as unknown as MachineGateway;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const prisma = {
    client: {
      operatorProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'op-profile-1' }) },
    },
  } as unknown as PrismaService;
  return { repo, logs, gateway, audit, prisma };
}

describe('MachineManagementService', () => {
  it('suspends a machine and audits', async () => {
    const { repo, logs, gateway, audit, prisma } = deps({
      findFullById: jest.fn().mockResolvedValue({ id: 'm1', operatorProfileId: null }),
    });
    const svc = new MachineManagementService(repo, logs, gateway, audit, prisma);
    const res = await svc.suspend(admin, 'm1', 'maintenance', req);
    expect(res.status).toBe('SUSPENDED');
    expect(repo.updateMachine).toHaveBeenCalledWith('m1', { status: 'SUSPENDED' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MACHINE_SUSPENDED' }),
    );
  });

  it('forbids an operator from touching a machine they do not own', async () => {
    const { repo, logs, gateway, audit, prisma } = deps({
      findFullById: jest.fn().mockResolvedValue({ id: 'm1', operatorProfileId: 'someone-else' }),
    });
    const svc = new MachineManagementService(repo, logs, gateway, audit, prisma);
    await expect(svc.requestRestart(operator, 'm1', req)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows an operator to restart their own machine', async () => {
    const { repo, logs, gateway, audit, prisma } = deps({
      findFullById: jest.fn().mockResolvedValue({ id: 'm1', operatorProfileId: 'op-profile-1' }),
    });
    const svc = new MachineManagementService(repo, logs, gateway, audit, prisma);
    const res = await svc.requestRestart(operator, 'm1', req);
    expect(res.requested).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MACHINE_RESTART_REQUESTED' }),
    );
  });

  it('throws NotFound for a missing machine', async () => {
    const { repo, logs, gateway, audit, prisma } = deps({
      findFullById: jest.fn().mockResolvedValue(null),
    });
    const svc = new MachineManagementService(repo, logs, gateway, audit, prisma);
    await expect(svc.detail(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes the operator fleet list to their own machines', async () => {
    const listMachines = jest.fn().mockResolvedValue([]);
    const { repo, logs, gateway, audit, prisma } = deps({ listMachines });
    const svc = new MachineManagementService(repo, logs, gateway, audit, prisma);
    await svc.list(operator);
    expect(listMachines).toHaveBeenCalledWith(
      expect.objectContaining({ operatorProfileId: 'op-profile-1' }),
      50,
      undefined,
    );
  });
});
