import { MachineLogsService } from './machine-logs.service';
import type { MachineRepository } from './machine.repository';
import type { MachineLogBatchInput } from '@print-karo/types';

describe('MachineLogsService', () => {
  it('ingests a batch of agent logs', async () => {
    const createLogs = jest.fn().mockResolvedValue({ count: 2 });
    const repo = { createLogs } as unknown as MachineRepository;
    const svc = new MachineLogsService(repo);

    const batch: MachineLogBatchInput = {
      logs: [
        { event: 'HEARTBEAT', level: 'DEBUG', occurredAt: new Date().toISOString() },
        { event: 'RECONNECT', level: 'INFO', occurredAt: new Date().toISOString() },
      ],
    };
    const res = await svc.ingestBatch('m1', batch, 'corr-1');
    expect(res.stored).toBe(2);
    expect(createLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ machineId: 'm1', event: 'HEARTBEAT', correlationId: 'corr-1' }),
      ]),
    );
  });

  it('records a single server event', async () => {
    const createLogs = jest.fn().mockResolvedValue({ count: 1 });
    const repo = { createLogs } as unknown as MachineRepository;
    const svc = new MachineLogsService(repo);
    await svc.recordServerEvent('m1', 'RESTART', 'WARN', { by: 'admin' });
    expect(createLogs).toHaveBeenCalledWith([
      expect.objectContaining({ event: 'RESTART', level: 'WARN' }),
    ]);
  });

  it('lists logs via the repository', () => {
    const listLogs = jest.fn().mockReturnValue(Promise.resolve([]));
    const repo = { listLogs } as unknown as MachineRepository;
    const svc = new MachineLogsService(repo);
    void svc.list('m1', 50);
    expect(listLogs).toHaveBeenCalledWith('m1', 50, undefined);
  });
});
