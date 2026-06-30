import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MachineJob } from '@print-karo/types';
import { MachineAgent } from './agent';
import { ApiError } from './api-client';
import type { MachineApiClient } from './api-client';
import type { HeartbeatBuilder } from './heartbeat-builder';
import { AgentLogger } from './logger';
import type { PrintRunner } from './print-runner';
import type { AgentConfig } from './config';

const config: AgentConfig = {
  apiBaseUrl: 'http://api',
  machineId: 'm1',
  machineSecret: 's',
  heartbeatIntervalSec: 30,
  queuePollIntervalSec: 15,
  logUploadIntervalSec: 60,
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30000,
};

const heartbeat = {
  build: vi.fn().mockResolvedValue({ runtimeState: 'IDLE', timestamp: 'now' }),
} as unknown as HeartbeatBuilder;

function makeApi(overrides: Partial<MachineApiClient> = {}) {
  return {
    isAuthenticated: true,
    login: vi.fn().mockResolvedValue(undefined),
    sendHeartbeat: vi.fn().mockResolvedValue({}),
    pollJobs: vi.fn().mockResolvedValue({ hasJob: false, job: null }),
    acceptJob: vi.fn().mockResolvedValue({ accepted: true }),
    rejectJob: vi.fn().mockResolvedValue({ rejected: true }),
    reportPrintResult: vi.fn().mockResolvedValue({ recorded: true }),
    uploadLogs: vi.fn().mockResolvedValue({ stored: 0 }),
    logout: vi.fn().mockResolvedValue({ loggedOut: true }),
    ...overrides,
  } as unknown as MachineApiClient;
}

function makeRunner(result = { success: true, pagesPrinted: 1 }): PrintRunner {
  return { run: vi.fn().mockResolvedValue(result) } as unknown as PrintRunner;
}

const sampleJob: MachineJob = {
  jobId: 'job-1',
  orderId: 'o1',
  orderNumber: 'PK-1',
  downloadUrl: 'http://x/get',
  checksum: 'sum',
  printOptions: { copies: 1, colorMode: 'BW', duplex: false, paperSize: 'A4', pageRange: null },
  expiresAt: new Date().toISOString(),
};

describe('MachineAgent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('connects, goes online, and sends an immediate heartbeat', async () => {
    const api = makeApi();
    const states: string[] = [];
    const agent = new MachineAgent(config, api, heartbeat, new AgentLogger(), makeRunner(), (s) =>
      states.push(s),
    );
    await agent.start();
    expect(agent.getState()).toBe('online');
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.sendHeartbeat).toHaveBeenCalledTimes(1);
    expect(states).toContain('connecting');
    expect(states).toContain('online');
    await agent.stop();
  });

  it('retries connection with backoff when login fails', async () => {
    const login = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined);
    const api = makeApi({ login });
    const agent = new MachineAgent(config, api, heartbeat, new AgentLogger(), makeRunner());

    const startPromise = agent.start();
    // First attempt fails → schedules a 1000ms reconnect.
    await vi.advanceTimersByTimeAsync(1000);
    await startPromise;

    expect(login).toHaveBeenCalledTimes(2);
    expect(agent.getState()).toBe('online');
    await agent.stop();
  });

  it('runs the heartbeat loop on its interval', async () => {
    const api = makeApi();
    const agent = new MachineAgent(config, api, heartbeat, new AgentLogger(), makeRunner());
    await agent.start();
    expect(api.sendHeartbeat).toHaveBeenCalledTimes(1); // immediate

    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.sendHeartbeat).toHaveBeenCalledTimes(2);
    await agent.stop();
  });

  it('does not reconnect on a transient 5xx during a loop', async () => {
    const sendHeartbeat = vi
      .fn()
      .mockResolvedValueOnce({}) // immediate
      .mockRejectedValueOnce(new ApiError('server', 503));
    const login = vi.fn().mockResolvedValue(undefined);
    const api = makeApi({ sendHeartbeat, login });
    const agent = new MachineAgent(config, api, heartbeat, new AgentLogger(), makeRunner());
    await agent.start();

    await vi.advanceTimersByTimeAsync(30_000);
    // 5xx is transient → no re-login.
    expect(login).toHaveBeenCalledTimes(1);
    await agent.stop();
  });

  it('flushes logs and logs out on stop', async () => {
    const api = makeApi();
    const logger = new AgentLogger();
    logger.log('HEARTBEAT', 'INFO');
    const agent = new MachineAgent(config, api, heartbeat, logger, makeRunner());
    await agent.start();
    await agent.stop();
    expect(api.logout).toHaveBeenCalled();
    expect(agent.getState()).toBe('stopped');
  });

  it('runs a dispatched job end-to-end: accept → print → report', async () => {
    const pollJobs = vi
      .fn()
      .mockResolvedValueOnce({ hasJob: true, job: sampleJob })
      .mockResolvedValue({ hasJob: false, job: null });
    const api = makeApi({ pollJobs });
    const runner = makeRunner({ success: true, pagesPrinted: 1 });
    const agent = new MachineAgent(config, api, heartbeat, new AgentLogger(), runner);
    await agent.start();

    // First queue tick picks up and runs the job.
    await vi.advanceTimersByTimeAsync(15_000);

    expect(api.acceptJob).toHaveBeenCalledWith('job-1');
    expect(runner.run).toHaveBeenCalledWith(sampleJob);
    expect(api.reportPrintResult).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', success: true }),
    );
    await agent.stop();
  });

  it('reports a failure when the print runner fails', async () => {
    const pollJobs = vi
      .fn()
      .mockResolvedValueOnce({ hasJob: true, job: sampleJob })
      .mockResolvedValue({ hasJob: false, job: null });
    const api = makeApi({ pollJobs });
    const runner = makeRunner({
      success: false,
      errorCode: 'PRINT_FAILED',
      errorMessage: 'jam',
    } as never);
    const agent = new MachineAgent(config, api, heartbeat, new AgentLogger(), runner);
    await agent.start();

    await vi.advanceTimersByTimeAsync(15_000);

    expect(api.reportPrintResult).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', success: false, errorCode: 'PRINT_FAILED' }),
    );
    await agent.stop();
  });
});
