import type { MachineLogEvent, MachineLogInput, MachineLogLevel } from '@print-karo/types';

/**
 * Buffered logger. Events are kept in an in-memory ring buffer and flushed to
 * the backend by the log-upload loop, so a brief network outage never loses
 * recent logs and never blocks the agent.
 */
export class AgentLogger {
  private buffer: MachineLogInput[] = [];

  constructor(private readonly maxBuffer = 500) {}

  log(
    event: MachineLogEvent,
    level: MachineLogLevel = 'INFO',
    message?: string,
    context?: Record<string, unknown>,
  ): void {
    const entry: MachineLogInput = {
      event,
      level,
      message,
      context,
      occurredAt: new Date().toISOString(),
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();

    // Mirror to stdout for local diagnostics.
    // eslint-disable-next-line no-console
    console.log(`[agent:${level}] ${event}${message ? ` — ${message}` : ''}`);
  }

  /** Take up to `limit` buffered entries (removes them from the buffer). */
  drain(limit = 100): MachineLogInput[] {
    return this.buffer.splice(0, limit);
  }

  /** Return drained entries to the front of the buffer (on upload failure). */
  requeue(entries: MachineLogInput[]): void {
    this.buffer.unshift(...entries);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer = this.buffer.slice(0, this.maxBuffer);
    }
  }

  get size(): number {
    return this.buffer.length;
  }
}
