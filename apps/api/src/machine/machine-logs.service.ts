import { Injectable } from '@nestjs/common';
import type { MachineLogBatchInput, MachineLogEvent, MachineLogLevel } from '@print-karo/types';
import { MachineRepository } from './machine.repository';

/**
 * Persists machine event logs. Logs arrive in two ways:
 *   - uploaded in batches by the agent (POST /machine/log)
 *   - written server-side for server-observed events (recordServerEvent)
 */
@Injectable()
export class MachineLogsService {
  constructor(private readonly repo: MachineRepository) {}

  /** Ingest a batch of agent-uploaded logs. */
  async ingestBatch(
    machineId: string,
    batch: MachineLogBatchInput,
    correlationId?: string,
  ): Promise<{ stored: number }> {
    const rows = batch.logs.map((log) => ({
      machineId,
      level: log.level,
      event: log.event,
      message: log.message,
      context: (log.context ?? undefined) as never,
      correlationId,
      occurredAt: new Date(log.occurredAt),
    }));
    const result = await this.repo.createLogs(rows);
    return { stored: result.count };
  }

  /** Write a single server-originated log row. */
  async recordServerEvent(
    machineId: string,
    event: MachineLogEvent,
    level: MachineLogLevel,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.createLogs([
      {
        machineId,
        level,
        event,
        context: (context ?? undefined) as never,
        occurredAt: new Date(),
      },
    ]);
  }

  list(machineId: string, take: number, cursor?: string) {
    return this.repo.listLogs(machineId, take, cursor);
  }
}
