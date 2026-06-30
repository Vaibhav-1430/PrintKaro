import { Injectable, NotFoundException } from '@nestjs/common';
import type { MachineConfigResponse } from '@print-karo/types';
import { MachineRepository } from './machine.repository';
import { MachineLogsService } from './machine-logs.service';

/**
 * Serves server-owned configuration to a machine (GET /machine/config):
 * heartbeat/poll cadences, maintenance flag, and declared capabilities. The
 * agent fetches this on boot and periodically.
 */
@Injectable()
export class MachineConfigService {
  constructor(
    private readonly repo: MachineRepository,
    private readonly logs: MachineLogsService,
  ) {}

  async getConfig(machineId: string): Promise<MachineConfigResponse> {
    const [config, caps] = await Promise.all([
      this.repo.getConfiguration(machineId),
      this.repo.getCapabilities(machineId),
    ]);
    if (!config) throw new NotFoundException('Machine configuration not found');

    await this.logs.recordServerEvent(machineId, 'CONFIG_FETCHED', 'DEBUG');

    return {
      machineId,
      heartbeatIntervalSec: config.heartbeatIntervalSec,
      queuePollIntervalSec: config.queuePollIntervalSec,
      logUploadIntervalSec: config.logUploadIntervalSec,
      maintenanceMode: config.maintenanceMode,
      capabilities: {
        colorSupport: caps?.colorSupport ?? false,
        duplexSupport: caps?.duplexSupport ?? false,
        paperSizes: caps?.paperSizes ?? ['A4'],
        maxCopies: caps?.maxCopies ?? 50,
      },
      settings: (config.settings ?? null) as Record<string, unknown> | null,
    };
  }
}
