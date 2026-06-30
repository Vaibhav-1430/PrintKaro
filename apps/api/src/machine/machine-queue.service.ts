import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type { MachineJobsResponse, ReportPrintResultInput } from '@print-karo/types';
import { MachineLogsService } from './machine-logs.service';
import { MachineGateway } from './machine.gateway';
import { OrderQueueService } from '../order/order-queue.service';
import { PrintJobRepository } from '../order/print-job.repository';
import { OrderService } from '../order/order.service';
import { PinService } from '../pin/pin.service';

/**
 * The consumer side of the DB-backed print-job queue (Sprint 4). A machine polls
 * for the next claimable job; the claim is atomic (row-level lock + visibility
 * timeout) so concurrent pollers and restarts are safe. accept → PRINTING,
 * report → COMPLETED/FAILED, reject → requeue or dead-letter. The producer side
 * (dispatch + payload building) lives in OrderQueueService.
 */
@Injectable()
export class MachineQueueService {
  constructor(
    private readonly logs: MachineLogsService,
    private readonly gateway: MachineGateway,
    private readonly jobs: PrintJobRepository,
    @Inject(forwardRef(() => OrderQueueService)) private readonly producer: OrderQueueService,
    @Inject(forwardRef(() => OrderService)) private readonly orders: OrderService,
    @Inject(forwardRef(() => PinService)) private readonly pins: PinService,
    private readonly config: ConfigService,
  ) {}

  private get lockTtlSec(): number {
    return this.config.get<number>('PRINT_JOB_TIMEOUT_SEC', 300);
  }

  /**
   * Redeem a PIN at the machine: verify the code, move the order to
   * WAITING_AT_MACHINE, ensure its job is dispatched, then return the claimed
   * job so the agent can download + print immediately.
   */
  async redeemPin(machineId: string, pin: string): Promise<MachineJobsResponse> {
    const { orderId } = await this.pins.redeem(machineId, pin);
    await this.orders.markWaitingAtMachine(orderId);
    await this.producer.dispatch(orderId, machineId);
    await this.logs.recordServerEvent(machineId, 'JOB_ACCEPTED', 'INFO', { orderId, via: 'pin' });
    return this.poll(machineId);
  }

  /** Return the next claimable job for this machine (atomic claim), or none. */
  async poll(machineId: string): Promise<MachineJobsResponse> {
    const claimed = await this.jobs.claimNext(machineId, this.lockTtlSec);
    if (!claimed) return { hasJob: false, job: null };

    const job = await this.producer.buildMachineJob(claimed.id);
    if (!job) {
      // Payload could not be built (e.g. missing options) — fail the job.
      await this.jobs.update(claimed.id, {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: 'Job payload incomplete',
      });
      return { hasJob: false, job: null };
    }
    return { hasJob: true, job };
  }

  /** Machine confirms it is printing the job → order PRINTING. */
  async acceptJob(machineId: string, jobId: string): Promise<{ accepted: true }> {
    const job = await this.requireMachineJob(machineId, jobId);
    await this.jobs.update(job.id, { status: 'PRINTING', startedAt: new Date() });
    await this.orders.markPrinting(job.orderId);
    await this.logs.recordServerEvent(machineId, 'PRINT_START', 'INFO', {
      jobId,
      orderId: job.orderId,
    });
    this.gateway.emitStateChange(machineId, 'PRINTING');
    return { accepted: true };
  }

  /** Machine declines a job → requeue (attempts++) or dead-letter + order FAILED. */
  async rejectJob(machineId: string, jobId: string, reason?: string): Promise<{ rejected: true }> {
    const job = await this.requireMachineJob(machineId, jobId);
    await this.requeueOrDeadLetter(
      job.id,
      job.orderId,
      job.attempts,
      job.maxAttempts,
      machineId,
      reason ?? 'rejected',
    );
    await this.logs.recordServerEvent(machineId, 'JOB_REJECTED', 'WARN', { jobId, reason });
    return { rejected: true };
  }

  /** Machine reports the print result → COMPLETED or FAILED (with retry). */
  async reportResult(machineId: string, body: ReportPrintResultInput): Promise<{ recorded: true }> {
    const job = await this.requireMachineJob(machineId, body.jobId);

    if (body.success) {
      await this.jobs.update(job.id, { status: 'COMPLETED', completedAt: new Date() });
      await this.orders.markCompleted(job.orderId);
      await this.logs.recordServerEvent(machineId, 'PRINT_SUCCESS', 'INFO', {
        jobId: job.id,
        orderId: job.orderId,
        pagesPrinted: body.pagesPrinted,
      });
      this.gateway.emitStateChange(machineId, 'IDLE');
    } else {
      const reason = body.errorMessage ?? body.errorCode ?? 'print failed';
      await this.requeueOrDeadLetter(
        job.id,
        job.orderId,
        job.attempts,
        job.maxAttempts,
        machineId,
        reason,
      );
      await this.logs.recordServerEvent(machineId, 'PRINT_FAILURE', 'ERROR', {
        jobId: job.id,
        orderId: job.orderId,
        errorCode: body.errorCode,
      });
    }
    return { recorded: true };
  }

  // ── internals ───────────────────────────────────────────────────────

  private async requireMachineJob(machineId: string, jobId: string) {
    const job = await this.jobs.findById(jobId);
    if (!job || job.machineId !== machineId) {
      throw new NotFoundException('No such job for this machine.');
    }
    return job;
  }

  /** Increment attempts; requeue if budget remains, else dead-letter + fail order. */
  private async requeueOrDeadLetter(
    jobId: string,
    orderId: string,
    attempts: number,
    maxAttempts: number,
    machineId: string,
    reason: string,
  ): Promise<void> {
    const nextAttempts = attempts + 1;
    if (nextAttempts < maxAttempts) {
      await this.jobs.update(jobId, {
        status: 'DISPATCHED',
        attempts: nextAttempts,
        lockToken: null,
        claimedAt: null,
        lockedUntil: null,
        failureReason: reason,
      });
      return;
    }
    await this.jobs.update(jobId, {
      status: 'DEAD_LETTER',
      attempts: nextAttempts,
      failedAt: new Date(),
      failureReason: reason,
    });
    await this.orders.markFailed(orderId, reason);
    this.gateway.emitStateChange(machineId, 'ERROR');
  }
}
