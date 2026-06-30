import { Injectable, NotFoundException } from '@nestjs/common';
import { PRINTER_STATES, type PrinterState } from '@print-karo/types';
import { MachineRepository } from './machine.repository';

export interface PrinterSnapshot {
  printerName: string | null;
  state: PrinterState;
  paperRemaining: number | null;
  paperSize: string | null;
  colorAvailable: boolean;
  duplexAvailable: boolean;
  inkLevel: number | null;
  tonerLevel: number | null;
  errorCode: string | null;
}

/**
 * Server-side view of a machine's printer. The agent owns hardware detection
 * (hexagonal printer port); this service exposes the latest reported snapshot
 * and is the seam Sprint 4 will read when dispatching a print job.
 */
@Injectable()
export class MachinePrinterService {
  constructor(private readonly repo: MachineRepository) {}

  async getSnapshot(machineId: string): Promise<PrinterSnapshot> {
    const machine = await this.repo.findFullById(machineId);
    if (!machine) throw new NotFoundException('Machine not found');
    const p = machine.printer;
    return {
      printerName: p?.printerName ?? null,
      state: p?.state ?? PRINTER_STATES.UNKNOWN,
      paperRemaining: p?.paperRemaining ?? null,
      paperSize: p?.paperSize ?? null,
      colorAvailable: p?.colorAvailable ?? false,
      duplexAvailable: p?.duplexAvailable ?? false,
      inkLevel: p?.inkLevel ?? null,
      tonerLevel: p?.tonerLevel ?? null,
      errorCode: p?.errorCode ?? null,
    };
  }
}
