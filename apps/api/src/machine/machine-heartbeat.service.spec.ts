import { MACHINE_RUNTIME_STATES, PRINTER_STATES, type HeartbeatInput } from '@print-karo/types';
import { MachineHeartbeatService } from './machine-heartbeat.service';
import { MachineHealthService } from './machine-health.service';
import type { MachineRepository } from './machine.repository';
import type { MachineGateway } from './machine.gateway';
import type { CacheService } from '../cache/cache.service';

const hb: HeartbeatInput = {
  runtimeState: MACHINE_RUNTIME_STATES.IDLE,
  printerState: PRINTER_STATES.READY,
  networkOnline: true,
  internet: true,
  colorAvailable: true,
  duplexAvailable: true,
  paperRemaining: 100,
  inkLevel: 70,
  tonerLevel: 70,
  timestamp: new Date().toISOString(),
};

function makeService() {
  const now = new Date();
  const repo = {
    createHeartbeat: jest.fn().mockResolvedValue({}),
    upsertPrinter: jest.fn().mockResolvedValue({}),
    upsertNetwork: jest.fn().mockResolvedValue({}),
    upsertHealth: jest.fn().mockResolvedValue({
      runtimeState: MACHINE_RUNTIME_STATES.IDLE,
      printerState: PRINTER_STATES.READY,
      healthScore: 100,
      gateResult: 'READY',
      blockingReasons: [],
      printerConnected: true,
      paperAvailable: true,
      consumablesOk: true,
      internet: true,
      heartbeatFresh: true,
      lastHeartbeatAt: now,
      updatedAt: now,
    }),
    updateMachine: jest.fn().mockResolvedValue({}),
    getHealth: jest.fn(),
  } as unknown as MachineRepository;

  const gateway = {
    emitHealthUpdate: jest.fn(),
    emitStateChange: jest.fn(),
  } as unknown as MachineGateway;
  const cache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn(),
  } as unknown as CacheService;

  const svc = new MachineHeartbeatService(repo, new MachineHealthService(), gateway, cache);
  return { svc, repo, gateway, cache };
}

describe('MachineHeartbeatService', () => {
  it('ingests: appends history, upserts snapshots, caches, emits', async () => {
    const { svc, repo, gateway, cache } = makeService();
    const res = await svc.ingest('m1', hb);

    expect(repo.createHeartbeat).toHaveBeenCalledTimes(1);
    expect(repo.upsertPrinter).toHaveBeenCalledTimes(1);
    expect(repo.upsertNetwork).toHaveBeenCalledTimes(1);
    expect(repo.upsertHealth).toHaveBeenCalledTimes(1);
    expect(repo.updateMachine).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ lastHeartbeatAt: expect.any(Date) }),
    );
    expect(cache.set).toHaveBeenCalled();
    expect(gateway.emitHealthUpdate).toHaveBeenCalledWith(res);
    expect(res.machineId).toBe('m1');
  });

  it('getHealth returns the cached snapshot when present', async () => {
    const { svc, cache } = makeService();
    (cache.get as jest.Mock).mockResolvedValueOnce({ machineId: 'm1', gateResult: 'READY' });
    const res = await svc.getHealth('m1');
    expect(res?.gateResult).toBe('READY');
  });

  it('getHealth returns null when no snapshot exists', async () => {
    const { svc, repo } = makeService();
    (repo.getHealth as jest.Mock).mockResolvedValueOnce(null);
    expect(await svc.getHealth('m1')).toBeNull();
  });

  it('getHealth marks a stale snapshot BLOCKED', async () => {
    const { svc, repo, cache } = makeService();
    (cache.get as jest.Mock).mockResolvedValueOnce(null);
    (repo.getHealth as jest.Mock).mockResolvedValueOnce({
      runtimeState: MACHINE_RUNTIME_STATES.IDLE,
      printerState: PRINTER_STATES.READY,
      healthScore: 100,
      gateResult: 'READY',
      blockingReasons: [],
      printerConnected: true,
      paperAvailable: true,
      consumablesOk: true,
      internet: true,
      heartbeatFresh: true,
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      updatedAt: new Date(),
    });
    const res = await svc.getHealth('m1');
    expect(res?.gateResult).toBe('BLOCKED');
    expect(res?.blockingReasons).toContain('HEARTBEAT_STALE');
  });
});
