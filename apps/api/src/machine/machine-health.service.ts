import { Injectable } from '@nestjs/common';
import {
  HEALTH_GATE_RESULTS,
  MACHINE_RUNTIME_STATES,
  PRINTER_STATES,
  type HealthGateResult,
  type HeartbeatInput,
  type MachineHealthResponse,
} from '@print-karo/types';

export interface HealthComputation {
  healthScore: number;
  gateResult: HealthGateResult;
  blockingReasons: string[];
  printerConnected: boolean;
  paperAvailable: boolean;
  consumablesOk: boolean;
  internet: boolean;
  heartbeatFresh: boolean;
}

const LOW_CONSUMABLE_PCT = 10;
const MIN_PAPER_SHEETS = 1;
const HIGH_CPU = 92;
const HIGH_RAM = 92;
const HIGH_DISK = 95;
const HIGH_TEMP = 80;

/**
 * Pure health-gate computation. Derives a 0–100 score and a READY/WARNING/
 * BLOCKED decision from a heartbeat. BLOCKED means future payments must be
 * refused for this machine (enforced in Sprint 4).
 *
 * No I/O — fully unit-testable.
 */
@Injectable()
export class MachineHealthService {
  compute(hb: HeartbeatInput, heartbeatFresh = true): HealthComputation {
    const blockingReasons: string[] = [];

    const printerConnected =
      hb.printerState !== PRINTER_STATES.OFFLINE && hb.printerState !== PRINTER_STATES.UNKNOWN;
    const paperAvailable =
      hb.runtimeState !== MACHINE_RUNTIME_STATES.OUT_OF_PAPER &&
      (hb.paperRemaining === undefined || hb.paperRemaining >= MIN_PAPER_SHEETS);
    const consumablesOk =
      (hb.inkLevel === undefined || hb.inkLevel > LOW_CONSUMABLE_PCT) &&
      (hb.tonerLevel === undefined || hb.tonerLevel > LOW_CONSUMABLE_PCT);
    const internet = hb.internet;

    // Hard blockers — any one forces BLOCKED.
    if (!heartbeatFresh) blockingReasons.push('HEARTBEAT_STALE');
    if (!printerConnected) blockingReasons.push('PRINTER_OFFLINE');
    if (!paperAvailable) blockingReasons.push('OUT_OF_PAPER');
    if (hb.runtimeState === MACHINE_RUNTIME_STATES.PAPER_JAM) blockingReasons.push('PAPER_JAM');
    if (hb.runtimeState === MACHINE_RUNTIME_STATES.ERROR) blockingReasons.push('ERROR');
    if (hb.runtimeState === MACHINE_RUNTIME_STATES.MAINTENANCE) blockingReasons.push('MAINTENANCE');
    if (hb.errorCode) blockingReasons.push(`PRINTER_ERROR:${hb.errorCode}`);

    // Soft warnings — degrade score but don't block.
    const warnings: string[] = [];
    if (!consumablesOk) warnings.push('LOW_CONSUMABLES');
    if (!internet) warnings.push('NO_INTERNET');
    if ((hb.cpuUsage ?? 0) > HIGH_CPU) warnings.push('HIGH_CPU');
    if ((hb.ramUsage ?? 0) > HIGH_RAM) warnings.push('HIGH_RAM');
    if ((hb.diskUsage ?? 0) > HIGH_DISK) warnings.push('HIGH_DISK');
    if ((hb.temperature ?? 0) > HIGH_TEMP) warnings.push('HIGH_TEMPERATURE');

    // Weighted score (100 = perfect). Hard failures cost a lot; warnings less.
    let score = 100;
    score -= blockingReasons.length * 25;
    score -= warnings.length * 8;
    score = Math.max(0, Math.min(100, score));

    let gateResult: HealthGateResult;
    if (blockingReasons.length > 0) gateResult = HEALTH_GATE_RESULTS.BLOCKED;
    else if (warnings.length > 0) gateResult = HEALTH_GATE_RESULTS.WARNING;
    else gateResult = HEALTH_GATE_RESULTS.READY;

    return {
      healthScore: score,
      gateResult,
      blockingReasons: [...blockingReasons, ...warnings],
      printerConnected,
      paperAvailable,
      consumablesOk,
      internet,
      heartbeatFresh,
    };
  }

  /** Maps a stored MachineHealth row into the API response DTO. */
  toResponse(
    machineId: string,
    h: {
      runtimeState: MachineHealthResponse['runtimeState'];
      printerState: MachineHealthResponse['printerState'];
      healthScore: number;
      gateResult: HealthGateResult;
      blockingReasons: string[];
      printerConnected: boolean;
      paperAvailable: boolean;
      consumablesOk: boolean;
      internet: boolean;
      heartbeatFresh: boolean;
      lastHeartbeatAt: Date | null;
      updatedAt: Date;
    },
  ): MachineHealthResponse {
    return {
      machineId,
      runtimeState: h.runtimeState,
      printerState: h.printerState,
      healthScore: h.healthScore,
      gateResult: h.gateResult,
      blockingReasons: h.blockingReasons,
      checks: {
        printerConnected: h.printerConnected,
        paperAvailable: h.paperAvailable,
        consumablesOk: h.consumablesOk,
        internet: h.internet,
        heartbeatFresh: h.heartbeatFresh,
      },
      lastHeartbeatAt: h.lastHeartbeatAt?.toISOString() ?? null,
      updatedAt: h.updatedAt.toISOString(),
    };
  }
}
