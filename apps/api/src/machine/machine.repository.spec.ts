import { MachineRepository } from './machine.repository';
import type { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  const client = {
    machine: {
      findFirst: jest.fn().mockResolvedValue({ id: 'm1' }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'm1' }),
      update: jest.fn().mockResolvedValue({ id: 'm1' }),
    },
    machineHeartbeat: { create: jest.fn().mockResolvedValue({}) },
    machinePrinter: { upsert: jest.fn().mockResolvedValue({}) },
    machineNetwork: { upsert: jest.fn().mockResolvedValue({}) },
    machineHealth: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    machineConfiguration: { findUnique: jest.fn().mockResolvedValue(null) },
    machineCapabilities: { findUnique: jest.fn().mockResolvedValue(null) },
    machineLog: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  return { prisma: { client } as unknown as PrismaService, client };
}

describe('MachineRepository', () => {
  it('findActiveById filters deletedAt and includes credential', async () => {
    const { prisma, client } = makePrisma();
    await new MachineRepository(prisma).findActiveById('m1');
    expect(client.machine.findFirst).toHaveBeenCalledWith({
      where: { id: 'm1', deletedAt: null },
      include: { credential: true },
    });
  });

  it('listMachines applies cursor pagination and excludes deleted', async () => {
    const { prisma, client } = makePrisma();
    await new MachineRepository(prisma).listMachines({ status: 'ACTIVE' }, 10, 'cur');
    expect(client.machine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', deletedAt: null },
        take: 10,
        cursor: { id: 'cur' },
        skip: 1,
      }),
    );
  });

  it('upsertHealth strips id/machineId from the update payload', async () => {
    const { prisma, client } = makePrisma();
    await new MachineRepository(prisma).upsertHealth('m1', {
      machineId: 'm1',
      healthScore: 90,
    } as never);
    const arg = client.machineHealth.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ machineId: 'm1' });
    expect(arg.update).not.toHaveProperty('machineId');
    expect(arg.create).toHaveProperty('machineId', 'm1');
  });

  it('createLogs delegates to createMany', async () => {
    const { prisma, client } = makePrisma();
    await new MachineRepository(prisma).createLogs([{ machineId: 'm1' } as never]);
    expect(client.machineLog.createMany).toHaveBeenCalled();
  });

  it('createHeartbeat / upsertPrinter / upsertNetwork delegate correctly', async () => {
    const { prisma, client } = makePrisma();
    const repo = new MachineRepository(prisma);
    await repo.createHeartbeat({ machineId: 'm1' } as never);
    await repo.upsertPrinter('m1', { machineId: 'm1' } as never);
    await repo.upsertNetwork('m1', { machineId: 'm1' } as never);
    expect(client.machineHeartbeat.create).toHaveBeenCalled();
    expect(client.machinePrinter.upsert).toHaveBeenCalled();
    expect(client.machineNetwork.upsert).toHaveBeenCalled();
  });
});
