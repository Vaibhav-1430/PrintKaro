import { Injectable } from '@nestjs/common';
import {
  HEARTBEAT_STALE_AFTER_SEC,
  PRINTER_STATES,
  type HeartbeatInput,
  type MachineHealthResponse,
} from '@print-karo/types';
import { MachineRepository } from './machine.repository';
import { MachineHealthService } from './machine-health.service';
import { MachineGateway } from './machine.gateway';
import { CacheService } from '../cache/cache.service';

const healthCacheKey = (machineId: string) => `machine:health:${machineId}`;

/**
 * Ingests a machine heartbeat: appends time-series history, recomputes the
 * health snapshot, upserts printer/network snapshots, caches the result for
 * the dashboard hot path, and pushes a real-time update.
 */
@Injectable()
export class MachineHeartbeatService {
  constructor(
    private readonly repo: MachineRepository,
    private readonly health: MachineHealthService,
    private readonly gateway: MachineGateway,
    private readonly cache: CacheService,
  ) {}

  async ingest(machineId: string, hb: HeartbeatInput): Promise<MachineHealthResponse> {
    const reportedAt = new Date(hb.timestamp);
    const computed = this.health.compute(hb, true);

    // 1. Append the raw heartbeat (history).
    await this.repo.createHeartbeat({
      machineId,
      runtimeState: hb.runtimeState,
      printerState: hb.printerState,
      printerName: hb.printerName,
      cpuUsage: hb.cpuUsage,
      ramUsage: hb.ramUsage,
      diskUsage: hb.diskUsage,
      temperature: hb.temperature,
      networkOnline: hb.networkOnline,
      internet: hb.internet,
      paperRemaining: hb.paperRemaining,
      paperSize: hb.paperSize,
      colorAvailable: hb.colorAvailable,
      duplexAvailable: hb.duplexAvailable,
      inkLevel: hb.inkLevel,
      tonerLevel: hb.tonerLevel,
      currentJobId: hb.currentJobId,
      errorCode: hb.errorCode,
      reportedAt,
    });

    // 2. Upsert printer + network snapshots.
    await this.repo.upsertPrinter(machineId, {
      machineId,
      printerName: hb.printerName,
      state: hb.printerState,
      paperRemaining: hb.paperRemaining,
      paperSize: hb.paperSize,
      colorAvailable: hb.colorAvailable,
      duplexAvailable: hb.duplexAvailable,
      inkLevel: hb.inkLevel,
      tonerLevel: hb.tonerLevel,
      errorCode: hb.errorCode,
    });
    await this.repo.upsertNetwork(machineId, {
      machineId,
      online: hb.networkOnline,
      internet: hb.internet,
    });

    // 3. Upsert the health snapshot.
    const healthRow = await this.repo.upsertHealth(machineId, {
      machineId,
      runtimeState: hb.runtimeState,
      printerState: hb.printerState,
      healthScore: computed.healthScore,
      gateResult: computed.gateResult,
      blockingReasons: computed.blockingReasons,
      printerConnected: computed.printerConnected,
      paperAvailable: computed.paperAvailable,
      consumablesOk: computed.consumablesOk,
      internet: computed.internet,
      heartbeatFresh: true,
      cpuUsage: hb.cpuUsage,
      ramUsage: hb.ramUsage,
      diskUsage: hb.diskUsage,
      temperature: hb.temperature,
      lastHeartbeatAt: reportedAt,
    });

    // 4. Stamp machine.lastHeartbeatAt.
    await this.repo.updateMachine(machineId, { lastHeartbeatAt: reportedAt });

    // 5. Build response, cache it, push it.
    const response = this.health.toResponse(machineId, healthRow);
    await this.cache.set(healthCacheKey(machineId), response, HEARTBEAT_STALE_AFTER_SEC);
    this.gateway.emitHealthUpdate(response);

    return response;
  }

  /**
   * Returns the cached/stored health snapshot, marking it stale (and BLOCKED)
   * if the last heartbeat is older than the staleness window.
   */
  async getHealth(machineId: string): Promise<MachineHealthResponse | null> {
    const cached = await this.cache.get<MachineHealthResponse>(healthCacheKey(machineId));
    if (cached) return cached;

    const row = await this.repo.getHealth(machineId);
    if (!row) return null;

    const fresh =
      row.lastHeartbeatAt !== null &&
      Date.now() - row.lastHeartbeatAt.getTime() < HEARTBEAT_STALE_AFTER_SEC * 1000;

    const response = this.health.toResponse(machineId, {
      ...row,
      printerState: row.printerState ?? PRINTER_STATES.UNKNOWN,
      heartbeatFresh: fresh,
      gateResult: fresh ? row.gateResult : 'BLOCKED',
      blockingReasons: fresh ? row.blockingReasons : ['HEARTBEAT_STALE'],
    });
    return response;
  }
}
