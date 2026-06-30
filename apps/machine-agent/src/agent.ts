import { MACHINE_LOG_EVENTS } from '@print-karo/types';
import type { AgentConfig } from './config';
import type { MachineApiClient } from './api-client';
import { ApiError } from './api-client';
import type { HeartbeatBuilder } from './heartbeat-builder';
import type { AgentLogger } from './logger';
import type { PrintRunner } from './print-runner';

export type AgentState = 'stopped' | 'connecting' | 'online' | 'reconnecting';

export interface AgentStatusListener {
  (state: AgentState, detail?: string): void;
}

/**
 * The agent core: connects, then runs the heartbeat, queue-poll and log-upload
 * loops with auto-reconnect (exponential backoff). Hardware/transport are
 * injected, so this is fully unit-testable and identical on Windows and Pi.
 *
 * Sprint 3 polls the queue and acknowledges "ready" only — no printing.
 */
export class MachineAgent {
  private state: AgentState = 'stopped';
  private timers: NodeJS.Timeout[] = [];
  private reconnectDelay: number;
  private running = false;

  private currentJobId: string | null = null;

  constructor(
    private readonly config: AgentConfig,
    private readonly api: MachineApiClient,
    private readonly heartbeat: HeartbeatBuilder,
    private readonly logger: AgentLogger,
    private readonly printRunner: PrintRunner,
    private readonly listener?: AgentStatusListener,
  ) {
    this.reconnectDelay = config.reconnectBaseMs;
  }

  getState(): AgentState {
    return this.state;
  }

  private setState(state: AgentState, detail?: string): void {
    this.state = state;
    this.listener?.(state, detail);
  }

  /** Connect (with retry) then start the loops. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger.log(MACHINE_LOG_EVENTS.RECONNECT, 'INFO', 'Agent starting');
    await this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    while (this.running) {
      try {
        this.setState('connecting');
        await this.api.login();
        this.logger.log(MACHINE_LOG_EVENTS.LOGIN, 'INFO', 'Authenticated');
        this.reconnectDelay = this.config.reconnectBaseMs;
        this.setState('online');
        this.startLoops();
        // Immediately send a first heartbeat so the dashboard shows us online.
        await this.tickHeartbeat();
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.log(MACHINE_LOG_EVENTS.ERROR, 'ERROR', `Connect failed: ${msg}`);
        this.setState('reconnecting', msg);
        await this.delay(this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.config.reconnectMaxMs);
      }
    }
  }

  private startLoops(): void {
    this.clearTimers();
    this.timers.push(
      setInterval(() => void this.tickHeartbeat(), this.config.heartbeatIntervalSec * 1000),
      setInterval(() => void this.tickQueue(), this.config.queuePollIntervalSec * 1000),
      setInterval(() => void this.tickLogUpload(), this.config.logUploadIntervalSec * 1000),
    );
  }

  /** A network failure on any loop triggers a single reconnect cycle. */
  private async handleLoopError(err: unknown): Promise<void> {
    if (err instanceof ApiError && err.status >= 500) {
      // transient server error — keep looping, it'll recover.
      return;
    }
    if (!this.running) return;
    this.logger.log(MACHINE_LOG_EVENTS.RECONNECT, 'WARN', 'Lost connection, reconnecting');
    this.clearTimers();
    await this.connectWithRetry();
  }

  private async tickHeartbeat(): Promise<void> {
    try {
      const hb = await this.heartbeat.build(this.currentJobId ?? undefined);
      await this.api.sendHeartbeat(hb);
      this.logger.log(MACHINE_LOG_EVENTS.HEARTBEAT, 'DEBUG');
    } catch (err) {
      await this.handleLoopError(err);
    }
  }

  /**
   * Poll for a dispatched job and, if present, run it end-to-end:
   *   accept → download + silent print (PrintRunner) → report result.
   * Only one job is processed per tick; a busy agent skips polling.
   */
  private async tickQueue(): Promise<void> {
    if (this.currentJobId) return; // already printing; finish first
    let job: Awaited<ReturnType<MachineApiClient['pollJobs']>>['job'] = null;
    try {
      const res = await this.api.pollJobs();
      if (!res.hasJob || !res.job) return;
      job = res.job;
    } catch (err) {
      await this.handleLoopError(err);
      return;
    }

    // From here, transient errors must not trigger a full reconnect — the job is
    // already claimed server-side, so we run it and report the outcome.
    this.currentJobId = job.jobId;
    try {
      await this.api.acceptJob(job.jobId);
      this.logger.log(MACHINE_LOG_EVENTS.PRINT_START, 'INFO', `Printing order ${job.orderNumber}`);

      const result = await this.printRunner.run(job);

      await this.api.reportPrintResult({
        jobId: job.jobId,
        success: result.success,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        pagesPrinted: result.pagesPrinted,
      });
      this.logger.log(
        result.success ? MACHINE_LOG_EVENTS.PRINT_SUCCESS : MACHINE_LOG_EVENTS.PRINT_FAILURE,
        result.success ? 'INFO' : 'ERROR',
        result.success
          ? `Printed order ${job.orderNumber}`
          : `Print failed: ${result.errorMessage ?? ''}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.log(MACHINE_LOG_EVENTS.PRINT_FAILURE, 'ERROR', `Job ${job.jobId} error: ${msg}`);
    } finally {
      this.currentJobId = null;
    }
  }

  private async tickLogUpload(): Promise<void> {
    const batch = this.logger.drain(100);
    if (batch.length === 0) return;
    try {
      await this.api.uploadLogs(batch);
    } catch {
      // Put logs back; they'll go up on the next tick.
      this.logger.requeue(batch);
    }
  }

  /** Stop loops and revoke tokens. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.clearTimers();
    this.logger.log(MACHINE_LOG_EVENTS.SHUTDOWN, 'INFO', 'Agent stopping');
    // Best-effort: flush remaining logs + logout.
    const remaining = this.logger.drain(100);
    if (remaining.length > 0) await this.api.uploadLogs(remaining).catch(() => undefined);
    if (this.api.isAuthenticated) await this.api.logout().catch(() => undefined);
    this.setState('stopped');
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
