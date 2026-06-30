import { NotFoundException } from '@nestjs/common';
import { MachinePrinterService } from './machine-printer.service';
import type { MachineRepository } from './machine.repository';

describe('MachinePrinterService', () => {
  it('returns the latest printer snapshot', async () => {
    const repo = {
      findFullById: jest.fn().mockResolvedValue({
        printer: {
          printerName: 'HP M404',
          state: 'READY',
          paperRemaining: 120,
          paperSize: 'A4',
          colorAvailable: false,
          duplexAvailable: true,
          inkLevel: null,
          tonerLevel: 64,
          errorCode: null,
        },
      }),
    } as unknown as MachineRepository;
    const svc = new MachinePrinterService(repo);
    const snap = await svc.getSnapshot('m1');
    expect(snap.printerName).toBe('HP M404');
    expect(snap.tonerLevel).toBe(64);
  });

  it('defaults to UNKNOWN when no printer record exists', async () => {
    const repo = {
      findFullById: jest.fn().mockResolvedValue({ printer: null }),
    } as unknown as MachineRepository;
    const svc = new MachinePrinterService(repo);
    const snap = await svc.getSnapshot('m1');
    expect(snap.state).toBe('UNKNOWN');
    expect(snap.printerName).toBeNull();
  });

  it('throws NotFound for a missing machine', async () => {
    const repo = {
      findFullById: jest.fn().mockResolvedValue(null),
    } as unknown as MachineRepository;
    const svc = new MachinePrinterService(repo);
    await expect(svc.getSnapshot('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
