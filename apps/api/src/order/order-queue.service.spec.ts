import { OrderQueueService } from './order-queue.service';
import type { PrintJobRepository } from './print-job.repository';
import type { OrderRepository } from './order.repository';
import type { StoragePort } from '../storage/storage.port';
import type { AuditService } from '../audit/audit.service';

function make() {
  const jobs = {
    findByOrderId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    update: jest.fn().mockResolvedValue({}),
  } as unknown as PrintJobRepository;
  const orders = { findWithRelations: jest.fn() } as unknown as OrderRepository;
  const storage = {
    presignGet: jest.fn().mockResolvedValue({ url: 'http://x/get', expiresAt: 'soon' }),
  } as unknown as StoragePort;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { svc: new OrderQueueService(jobs, orders, storage, audit), jobs, orders, storage };
}

describe('OrderQueueService.dispatch', () => {
  it('creates a dispatched job when none exists', async () => {
    const { svc, jobs } = make();
    (jobs.findByOrderId as jest.Mock).mockResolvedValue(null);
    await svc.dispatch('o1', 'm1');
    expect(jobs.create).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o1', machineId: 'm1', status: 'DISPATCHED' }),
    );
  });

  it('re-dispatches an existing job (idempotent)', async () => {
    const { svc, jobs } = make();
    (jobs.findByOrderId as jest.Mock).mockResolvedValue({ id: 'job-1' });
    await svc.dispatch('o1', 'm1');
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'DISPATCHED' }),
    );
    expect(jobs.create).not.toHaveBeenCalled();
  });
});

describe('OrderQueueService.buildMachineJob', () => {
  it('builds a payload with a presigned download url', async () => {
    const { svc, jobs, orders } = make();
    (jobs.findById as jest.Mock).mockResolvedValue({ id: 'job-1', orderId: 'o1' });
    (orders.findWithRelations as jest.Mock).mockResolvedValue({
      id: 'o1',
      orderNumber: 'PK-1',
      upload: { storageKey: 'uploads/x', sha256: 'sum' },
      printOption: {
        copies: 2,
        colorMode: 'COLOR',
        duplex: true,
        paperSize: 'A4',
        pageRange: '1-3',
      },
    });
    const job = await svc.buildMachineJob('job-1');
    expect(job?.downloadUrl).toBe('http://x/get');
    expect(job?.checksum).toBe('sum');
    expect(job?.printOptions.copies).toBe(2);
  });

  it('returns null when the order has no options', async () => {
    const { svc, jobs, orders } = make();
    (jobs.findById as jest.Mock).mockResolvedValue({ id: 'job-1', orderId: 'o1' });
    (orders.findWithRelations as jest.Mock).mockResolvedValue({
      id: 'o1',
      printOption: null,
      upload: {},
    });
    expect(await svc.buildMachineJob('job-1')).toBeNull();
  });
});
