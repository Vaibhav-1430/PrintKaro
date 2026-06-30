import {
  HEALTH_GATE_RESULTS,
  MACHINE_RUNTIME_STATES,
  PRINTER_STATES,
  type HeartbeatInput,
} from '@print-karo/types';
import { MachineHealthService } from './machine-health.service';

const base: HeartbeatInput = {
  runtimeState: MACHINE_RUNTIME_STATES.IDLE,
  printerState: PRINTER_STATES.READY,
  networkOnline: true,
  internet: true,
  colorAvailable: true,
  duplexAvailable: true,
  paperRemaining: 200,
  inkLevel: 80,
  tonerLevel: 80,
  timestamp: new Date().toISOString(),
};

describe('MachineHealthService.compute', () => {
  const svc = new MachineHealthService();

  it('returns READY with score 100 for a healthy machine', () => {
    const r = svc.compute(base);
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.READY);
    expect(r.healthScore).toBe(100);
    expect(r.blockingReasons).toEqual([]);
  });

  it('BLOCKS when the heartbeat is stale', () => {
    const r = svc.compute(base, false);
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.BLOCKED);
    expect(r.heartbeatFresh).toBe(false);
    expect(r.blockingReasons).toContain('HEARTBEAT_STALE');
  });

  it('BLOCKS when the printer is offline', () => {
    const r = svc.compute({ ...base, printerState: PRINTER_STATES.OFFLINE });
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.BLOCKED);
    expect(r.printerConnected).toBe(false);
    expect(r.blockingReasons).toContain('PRINTER_OFFLINE');
  });

  it('BLOCKS when out of paper (runtime state)', () => {
    const r = svc.compute({ ...base, runtimeState: MACHINE_RUNTIME_STATES.OUT_OF_PAPER });
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.BLOCKED);
    expect(r.paperAvailable).toBe(false);
    expect(r.blockingReasons).toContain('OUT_OF_PAPER');
  });

  it('BLOCKS when paper sheets reach zero', () => {
    const r = svc.compute({ ...base, paperRemaining: 0 });
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.BLOCKED);
    expect(r.blockingReasons).toContain('OUT_OF_PAPER');
  });

  it('BLOCKS on paper jam', () => {
    const r = svc.compute({ ...base, runtimeState: MACHINE_RUNTIME_STATES.PAPER_JAM });
    expect(r.blockingReasons).toContain('PAPER_JAM');
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.BLOCKED);
  });

  it('BLOCKS on maintenance mode', () => {
    const r = svc.compute({ ...base, runtimeState: MACHINE_RUNTIME_STATES.MAINTENANCE });
    expect(r.blockingReasons).toContain('MAINTENANCE');
  });

  it('BLOCKS on a reported printer error code', () => {
    const r = svc.compute({ ...base, errorCode: 'E045' });
    expect(r.blockingReasons.some((b) => b.startsWith('PRINTER_ERROR'))).toBe(true);
  });

  it('WARNS (not blocks) on low consumables', () => {
    const r = svc.compute({ ...base, inkLevel: 5 });
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.WARNING);
    expect(r.consumablesOk).toBe(false);
    expect(r.healthScore).toBeLessThan(100);
  });

  it('WARNS on no internet', () => {
    const r = svc.compute({ ...base, internet: false });
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.WARNING);
    expect(r.internet).toBe(false);
  });

  it('WARNS on high CPU/RAM/disk/temperature', () => {
    const r = svc.compute({ ...base, cpuUsage: 99, ramUsage: 99, diskUsage: 99, temperature: 95 });
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.WARNING);
    expect(r.blockingReasons).toEqual(
      expect.arrayContaining(['HIGH_CPU', 'HIGH_RAM', 'HIGH_DISK', 'HIGH_TEMPERATURE']),
    );
  });

  it('never returns a negative score', () => {
    const r = svc.compute({
      ...base,
      printerState: PRINTER_STATES.OFFLINE,
      runtimeState: MACHINE_RUNTIME_STATES.PAPER_JAM,
      errorCode: 'X',
      inkLevel: 1,
      internet: false,
      cpuUsage: 100,
    });
    expect(r.healthScore).toBeGreaterThanOrEqual(0);
    expect(r.gateResult).toBe(HEALTH_GATE_RESULTS.BLOCKED);
  });

  it('toResponse maps a stored health row to the DTO', () => {
    const now = new Date();
    const dto = svc.toResponse('m1', {
      runtimeState: MACHINE_RUNTIME_STATES.IDLE,
      printerState: PRINTER_STATES.READY,
      healthScore: 90,
      gateResult: HEALTH_GATE_RESULTS.READY,
      blockingReasons: [],
      printerConnected: true,
      paperAvailable: true,
      consumablesOk: true,
      internet: true,
      heartbeatFresh: true,
      lastHeartbeatAt: now,
      updatedAt: now,
    });
    expect(dto.machineId).toBe('m1');
    expect(dto.checks.printerConnected).toBe(true);
    expect(dto.lastHeartbeatAt).toBe(now.toISOString());
  });
});
