import { PrintJobRepository } from './print-job.repository';
import type { PrismaService } from '../prisma/prisma.service';

function make() {
  const printJob = {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  };
  const prisma = { client: { printJob } } as unknown as PrismaService;
  return { repo: new PrintJobRepository(prisma), printJob };
}

describe('PrintJobRepository.claimNext', () => {
  it('returns null when no candidate is dispatchable', async () => {
    const { repo, printJob } = make();
    printJob.findFirst.mockResolvedValue(null);
    expect(await repo.claimNext('m1', 300)).toBeNull();
    expect(printJob.updateMany).not.toHaveBeenCalled();
  });

  it('atomically claims a candidate and returns its lock token', async () => {
    const { repo, printJob } = make();
    printJob.findFirst.mockResolvedValue({ id: 'job-1' });
    printJob.updateMany.mockResolvedValue({ count: 1 });
    const claimed = await repo.claimNext('m1', 300);
    expect(claimed?.id).toBe('job-1');
    expect(typeof claimed?.lockToken).toBe('string');
    // The conditional update guards on status + visibility timeout.
    const where = printJob.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe('job-1');
    expect(where.status.in).toEqual(['QUEUED', 'DISPATCHED']);
  });

  it('returns null when it loses the claim race', async () => {
    const { repo, printJob } = make();
    printJob.findFirst.mockResolvedValue({ id: 'job-1' });
    printJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await repo.claimNext('m1', 300)).toBeNull();
  });
});

describe('PrintJobRepository.reclaimExpired', () => {
  it('resets expired locks back to DISPATCHED', async () => {
    const { repo, printJob } = make();
    printJob.updateMany.mockResolvedValue({ count: 2 });
    await repo.reclaimExpired(new Date());
    const data = printJob.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('DISPATCHED');
    expect(data.lockToken).toBeNull();
  });
});
