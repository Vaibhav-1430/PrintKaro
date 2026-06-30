import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@print-karo/database';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Data-access boundary for the DB-backed print job queue. The claim is an atomic
 * conditional updateMany (status + visibility-timeout guard), giving FIFO +
 * locking + retry + dead-letter + restart-recovery with no external queue infra.
 * All queue mutations funnel through MachineQueueService, which uses this repo.
 */
@Injectable()
export class PrintJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.PrintJobUncheckedCreateInput) {
    return this.prisma.client.printJob.create({ data });
  }

  findByOrderId(orderId: string) {
    return this.prisma.client.printJob.findUnique({ where: { orderId } });
  }

  findById(id: string) {
    return this.prisma.client.printJob.findUnique({ where: { id } });
  }

  /**
   * Atomically claim the next dispatchable job for a machine. Returns the claimed
   * job (with a fresh lock token) or null if none. The conditional update makes
   * this safe against concurrent pollers and reclaims jobs whose lock expired.
   */
  async claimNext(
    machineId: string,
    lockTtlSec: number,
  ): Promise<{ id: string; lockToken: string } | null> {
    const now = new Date();
    const lockToken = randomUUID();
    const lockedUntil = new Date(now.getTime() + lockTtlSec * 1000);

    // Find the oldest dispatchable/claimable job for this machine.
    const candidate = await this.prisma.client.printJob.findFirst({
      where: {
        machineId,
        status: { in: ['QUEUED', 'DISPATCHED'] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) return null;

    // Conditionally claim it — only succeeds if it's still free (race-safe).
    const claimed = await this.prisma.client.printJob.updateMany({
      where: {
        id: candidate.id,
        status: { in: ['QUEUED', 'DISPATCHED'] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { status: 'CLAIMED', lockToken, claimedAt: now, lockedUntil },
    });
    if (claimed.count === 0) return null; // lost the race; caller may retry
    return { id: candidate.id, lockToken };
  }

  update(id: string, data: Prisma.PrintJobUncheckedUpdateInput) {
    return this.prisma.client.printJob.update({ where: { id }, data });
  }

  /** Reclaim jobs whose lock has expired back to DISPATCHED (restart recovery). */
  reclaimExpired(now: Date = new Date()) {
    return this.prisma.client.printJob.updateMany({
      where: { status: { in: ['CLAIMED', 'PRINTING'] }, lockedUntil: { lt: now } },
      data: { status: 'DISPATCHED', lockToken: null, claimedAt: null, lockedUntil: null },
    });
  }
}
