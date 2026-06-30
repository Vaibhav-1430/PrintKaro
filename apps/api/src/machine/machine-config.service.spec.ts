import { NotFoundException } from '@nestjs/common';
import { MachineConfigService } from './machine-config.service';
import type { MachineRepository } from './machine.repository';
import type { MachineLogsService } from './machine-logs.service';

const logs = {
  recordServerEvent: jest.fn().mockResolvedValue(undefined),
} as unknown as MachineLogsService;

describe('MachineConfigService', () => {
  it('returns config + capabilities and logs the fetch', async () => {
    const repo = {
      getConfiguration: jest.fn().mockResolvedValue({
        heartbeatIntervalSec: 30,
        queuePollIntervalSec: 15,
        logUploadIntervalSec: 60,
        maintenanceMode: false,
        settings: { foo: 'bar' },
      }),
      getCapabilities: jest.fn().mockResolvedValue({
        colorSupport: true,
        duplexSupport: false,
        paperSizes: ['A4'],
        maxCopies: 50,
      }),
    } as unknown as MachineRepository;
    const svc = new MachineConfigService(repo, logs);

    const cfg = await svc.getConfig('m1');
    expect(cfg.heartbeatIntervalSec).toBe(30);
    expect(cfg.capabilities.colorSupport).toBe(true);
    expect(cfg.settings).toEqual({ foo: 'bar' });
    expect(logs.recordServerEvent).toHaveBeenCalledWith('m1', 'CONFIG_FETCHED', 'DEBUG');
  });

  it('throws when configuration is missing', async () => {
    const repo = {
      getConfiguration: jest.fn().mockResolvedValue(null),
      getCapabilities: jest.fn().mockResolvedValue(null),
    } as unknown as MachineRepository;
    const svc = new MachineConfigService(repo, logs);
    await expect(svc.getConfig('m1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
