import { MachineRuntimeController } from './machine-runtime.controller';
import type { MachineService } from './machine.service';
import type { MachineHeartbeatService } from './machine-heartbeat.service';
import type { MachineQueueService } from './machine-queue.service';
import type { MachineLogsService } from './machine-logs.service';
import type { MachineConfigService } from './machine-config.service';
import type { MachinePrincipal } from '../rbac/auth-context';

const machine: MachinePrincipal = { type: 'MACHINE', machineId: 'm1', code: 'PK-1' };
const req = { headers: {}, correlationId: 'c1' } as never;

function makeController() {
  const machineService = {
    logout: jest.fn().mockResolvedValue({ loggedOut: true }),
  } as unknown as MachineService;
  const heartbeat = {
    ingest: jest.fn().mockResolvedValue({ machineId: 'm1' }),
    getHealth: jest.fn().mockResolvedValue({ machineId: 'm1' }),
  } as unknown as MachineHeartbeatService;
  const queue = {
    poll: jest.fn().mockResolvedValue({ hasJob: false, job: null }),
    acceptJob: jest.fn(),
    rejectJob: jest.fn(),
  } as unknown as MachineQueueService;
  const logs = {
    ingestBatch: jest.fn().mockResolvedValue({ stored: 1 }),
  } as unknown as MachineLogsService;
  const config = {
    getConfig: jest.fn().mockResolvedValue({ machineId: 'm1' }),
  } as unknown as MachineConfigService;
  return {
    controller: new MachineRuntimeController(machineService, heartbeat, queue, logs, config),
    machineService,
    heartbeat,
    queue,
    logs,
    config,
  };
}

describe('MachineRuntimeController', () => {
  it('heartbeat delegates to the heartbeat service', () => {
    const { controller, heartbeat } = makeController();
    void controller.ingestHeartbeat(machine, { runtimeState: 'IDLE' } as never);
    expect(heartbeat.ingest).toHaveBeenCalledWith('m1', { runtimeState: 'IDLE' });
  });

  it('status delegates to getHealth', () => {
    const { controller, heartbeat } = makeController();
    void controller.status(machine);
    expect(heartbeat.getHealth).toHaveBeenCalledWith('m1');
  });

  it('config delegates to the config service', () => {
    const { controller, config } = makeController();
    void controller.getConfig(machine);
    expect(config.getConfig).toHaveBeenCalledWith('m1');
  });

  it('jobs delegates to the queue poll', () => {
    const { controller, queue } = makeController();
    void controller.jobs(machine);
    expect(queue.poll).toHaveBeenCalledWith('m1');
  });

  it('accept/reject delegate to the queue', () => {
    const { controller, queue } = makeController();
    void controller.acceptJob(machine, { jobId: 'j1' });
    void controller.rejectJob(machine, { jobId: 'j1', reason: 'x' });
    expect(queue.acceptJob).toHaveBeenCalledWith('m1', 'j1');
    expect(queue.rejectJob).toHaveBeenCalledWith('m1', 'j1', 'x');
  });

  it('uploadLogs passes the correlation id', () => {
    const { controller, logs } = makeController();
    void controller.uploadLogs(machine, { logs: [] } as never, req);
    expect(logs.ingestBatch).toHaveBeenCalledWith('m1', { logs: [] }, 'c1');
  });

  it('logout delegates to the machine service', () => {
    const { controller, machineService } = makeController();
    void controller.logout(machine, req);
    expect(machineService.logout).toHaveBeenCalledWith('m1', req);
  });
});
