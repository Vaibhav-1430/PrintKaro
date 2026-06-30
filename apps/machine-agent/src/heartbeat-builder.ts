import {
  MACHINE_RUNTIME_STATES,
  PRINTER_STATES,
  type HeartbeatInput,
  type MachineRuntimeState,
} from '@print-karo/types';
import type { PrinterPort } from './printer/printer.port';
import type { SystemMetricsCollector } from './system/metrics';
import type { NetworkChecker } from './system/network';

/**
 * Builds a heartbeat from the current printer status, host metrics and network
 * state. Derives the machine runtime state from those signals so the backend's
 * health gate has everything it needs — identical shape on Windows and Pi.
 */
export class HeartbeatBuilder {
  constructor(
    private readonly printer: PrinterPort,
    private readonly metrics: SystemMetricsCollector,
    private readonly network: NetworkChecker,
  ) {}

  async build(currentJobId?: string): Promise<HeartbeatInput> {
    const [printer, metrics, net] = await Promise.all([
      this.printer.getStatus(),
      this.metrics.collect(),
      this.network.check(),
    ]);

    const runtimeState = this.deriveRuntimeState(printer.state, printer, Boolean(currentJobId));

    return {
      runtimeState,
      printerState: printer.state,
      printerName: printer.printerName ?? undefined,
      cpuUsage: metrics.cpuUsage ?? undefined,
      ramUsage: metrics.ramUsage ?? undefined,
      diskUsage: metrics.diskUsage ?? undefined,
      temperature: metrics.temperature ?? undefined,
      networkOnline: net.online,
      internet: net.internet,
      paperRemaining: printer.paperRemaining ?? undefined,
      paperSize: printer.paperSize ?? undefined,
      colorAvailable: printer.colorAvailable,
      duplexAvailable: printer.duplexAvailable,
      inkLevel: printer.inkLevel ?? undefined,
      tonerLevel: printer.tonerLevel ?? undefined,
      currentJobId,
      errorCode: printer.errorCode ?? undefined,
      timestamp: new Date().toISOString(),
    };
  }

  private deriveRuntimeState(
    printerState: HeartbeatInput['printerState'],
    printer: {
      errorCode: string | null;
      paperRemaining: number | null;
      inkLevel: number | null;
      tonerLevel: number | null;
    },
    printing: boolean,
  ): MachineRuntimeState {
    if (printer.errorCode === 'OUT_OF_PAPER' || printer.paperRemaining === 0) {
      return MACHINE_RUNTIME_STATES.OUT_OF_PAPER;
    }
    if (printerState === PRINTER_STATES.OFFLINE) return MACHINE_RUNTIME_STATES.PRINTER_OFFLINE;
    if (printerState === PRINTER_STATES.ERROR) return MACHINE_RUNTIME_STATES.ERROR;
    if (printer.inkLevel !== null && printer.inkLevel <= 10) return MACHINE_RUNTIME_STATES.LOW_INK;
    if (printer.tonerLevel !== null && printer.tonerLevel <= 10) {
      return MACHINE_RUNTIME_STATES.LOW_TONER;
    }
    if (printing || printerState === PRINTER_STATES.BUSY) return MACHINE_RUNTIME_STATES.PRINTING;
    if (printerState === PRINTER_STATES.PAUSED) return MACHINE_RUNTIME_STATES.PAUSED;
    return MACHINE_RUNTIME_STATES.IDLE;
  }
}
