import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS, type MachineJob } from '@print-karo/types';
import { PrintJobRepository } from './print-job.repository';
import { OrderRepository } from './order.repository';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { AuditService } from '../audit/audit.service';

/**
 * Print-job dispatch + completion (the producer/admin side of the DB-backed
 * queue). The consumer side (poll/claim/accept) lives in MachineQueueService,
 * which shares PrintJobRepository. Building the MachineJob payload (presigned
 * GET + options) lives here so the dispatch contract is in one place.
 */
@Injectable()
export class OrderQueueService {
  constructor(
    private readonly jobs: PrintJobRepository,
    private readonly orders: OrderRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly audit: AuditService,
  ) {}

  /** Create + dispatch a print job for a paid order. Idempotent per order. */
  async dispatch(orderId: string, machineId: string): Promise<void> {
    const existing = await this.jobs.findByOrderId(orderId);
    if (existing) {
      await this.jobs.update(existing.id, { status: 'DISPATCHED', dispatchedAt: new Date() });
    } else {
      await this.jobs.create({
        orderId,
        machineId,
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
      });
    }
    await this.audit.record({
      action: AUDIT_ACTIONS.PRINT_DISPATCHED,
      actorType: 'SYSTEM',
      targetType: 'Order',
      targetId: orderId,
      metadata: { machineId },
    });
  }

  /** Build the dispatch payload (presigned download + options) for a claimed job. */
  async buildMachineJob(jobId: string): Promise<MachineJob | null> {
    const job = await this.jobs.findById(jobId);
    if (!job) return null;
    const order = await this.orders.findWithRelations(job.orderId);
    if (!order || !order.printOption) return null;

    const { url, expiresAt } = await this.storage.presignGet(order.upload.storageKey);
    return {
      jobId: job.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      downloadUrl: url,
      checksum: order.upload.sha256,
      printOptions: {
        copies: order.printOption.copies,
        colorMode: order.printOption.colorMode as MachineJob['printOptions']['colorMode'],
        duplex: order.printOption.duplex,
        paperSize: order.printOption.paperSize,
        pageRange: order.printOption.pageRange,
      },
      expiresAt,
    };
  }
}
