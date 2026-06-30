import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MachineQueueService } from './machine-queue.service';
import type { MachineLogsService } from './machine-logs.service';
import type { MachineGateway } from './machine.gateway';
import type { PrintJobRepository } from '../order/print-job.repository';
import type { OrderQueueService } from '../order/order-queue.service';
import type { OrderService } from '../order/order.service';
import type { PinService } from '../pin/pin.service';
import type { MachineJob } from '@print-karo/types';

const job = (
  over: Partial<{
    id: string;
    machineId: string;
    orderId: string;
    attempts: number;
    maxAttempts: number;
  }> = {},
) => ({
  id: 'job-1',
  machineId: 'm1',
  orderId: 'o1',
  status: 'CLAIMED',
  attempts: 0,
  maxAttempts: 3,
  ...over,
});

const machineJob: MachineJob = {
  jobId: 'job-1',
  orderId: 'o1',
  orderNumber: 'PK-1',
  downloadUrl: 'http://x/get',
  checksum: 'abc',
  printOptions: { copies: 1, colorMode: 'BW', duplex: false, paperSize: 'A4', pageRange: null },
  expiresAt: new Date().toISOString(),
};

function make() {
  const logs = {
    recordServerEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as MachineLogsService;
  const gateway = { emitStateChange: jest.fn() } as unknown as MachineGateway;
  const jobs = {
    claimNext: jest.fn(),
    findById: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  } as unknown as PrintJobRepository;
  const producer = {
    buildMachineJob: jest.fn(),
    dispatch: jest.fn().mockResolvedValue(undefined),
  } as unknown as OrderQueueService;
  const orders = {
    markPrinting: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markWaitingAtMachine: jest.fn().mockResolvedValue(undefined),
  } as unknown as OrderService;
  const pins = { redeem: jest.fn() } as unknown as PinService;
  const config = { get: (_k: string, d: number) => d } as unknown as ConfigService;
  const svc = new MachineQueueService(logs, gateway, jobs, producer, orders, pins, config);
  return { svc, logs, gateway, jobs, producer, orders, pins };
}

describe('MachineQueueService.poll', () => {
  it('returns no job when nothing is claimable', async () => {
    const { svc, jobs } = make();
    (jobs.claimNext as jest.Mock).mockResolvedValue(null);
    expect(await svc.poll('m1')).toEqual({ hasJob: false, job: null });
  });

  it('returns the built MachineJob for a claimed job', async () => {
    const { svc, jobs, producer } = make();
    (jobs.claimNext as jest.Mock).mockResolvedValue({ id: 'job-1', lockToken: 'lt' });
    (producer.buildMachineJob as jest.Mock).mockResolvedValue(machineJob);
    const res = await svc.poll('m1');
    expect(res.hasJob).toBe(true);
    expect(res.job).toEqual(machineJob);
  });

  it('fails the job when the payload cannot be built', async () => {
    const { svc, jobs, producer } = make();
    (jobs.claimNext as jest.Mock).mockResolvedValue({ id: 'job-1', lockToken: 'lt' });
    (producer.buildMachineJob as jest.Mock).mockResolvedValue(null);
    const res = await svc.poll('m1');
    expect(res.hasJob).toBe(false);
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});

describe('MachineQueueService.acceptJob', () => {
  it('marks the order printing and the job PRINTING', async () => {
    const { svc, jobs, orders, gateway } = make();
    (jobs.findById as jest.Mock).mockResolvedValue(job());
    const res = await svc.acceptJob('m1', 'job-1');
    expect(res).toEqual({ accepted: true });
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'PRINTING' }),
    );
    expect(orders.markPrinting).toHaveBeenCalledWith('o1');
    expect(gateway.emitStateChange).toHaveBeenCalledWith('m1', 'PRINTING');
  });

  it('rejects a job that is not for this machine', async () => {
    const { svc, jobs } = make();
    (jobs.findById as jest.Mock).mockResolvedValue(job({ machineId: 'other' }));
    await expect(svc.acceptJob('m1', 'job-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MachineQueueService.reportResult', () => {
  it('completes the order on success', async () => {
    const { svc, jobs, orders } = make();
    (jobs.findById as jest.Mock).mockResolvedValue(job());
    const res = await svc.reportResult('m1', { jobId: 'job-1', success: true, pagesPrinted: 2 });
    expect(res).toEqual({ recorded: true });
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'COMPLETED' }),
    );
    expect(orders.markCompleted).toHaveBeenCalledWith('o1');
  });

  it('requeues on failure while attempts remain', async () => {
    const { svc, jobs, orders } = make();
    (jobs.findById as jest.Mock).mockResolvedValue(job({ attempts: 0, maxAttempts: 3 }));
    await svc.reportResult('m1', { jobId: 'job-1', success: false, errorMessage: 'jam' });
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'DISPATCHED', attempts: 1 }),
    );
    expect(orders.markFailed).not.toHaveBeenCalled();
  });

  it('dead-letters and fails the order when attempts are exhausted', async () => {
    const { svc, jobs, orders } = make();
    (jobs.findById as jest.Mock).mockResolvedValue(job({ attempts: 2, maxAttempts: 3 }));
    await svc.reportResult('m1', { jobId: 'job-1', success: false, errorMessage: 'jam' });
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'DEAD_LETTER' }),
    );
    expect(orders.markFailed).toHaveBeenCalledWith('o1', 'jam');
  });
});

describe('MachineQueueService.redeemPin', () => {
  it('redeems, advances the order, dispatches and returns the job', async () => {
    const { svc, jobs, producer, orders, pins } = make();
    (pins.redeem as jest.Mock).mockResolvedValue({ orderId: 'o1', pinId: 'p1' });
    (jobs.claimNext as jest.Mock).mockResolvedValue({ id: 'job-1', lockToken: 'lt' });
    (producer.buildMachineJob as jest.Mock).mockResolvedValue(machineJob);

    const res = await svc.redeemPin('m1', '1234');

    expect(pins.redeem).toHaveBeenCalledWith('m1', '1234');
    expect(orders.markWaitingAtMachine).toHaveBeenCalledWith('o1');
    expect(producer.dispatch).toHaveBeenCalledWith('o1', 'm1');
    expect(res.hasJob).toBe(true);
  });
});
