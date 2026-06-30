import { PRINTER_STATES } from '@print-karo/types';
import type {
  DetectedPrinter,
  PrinterPort,
  PrinterStatus,
  PrintRequest,
  PrintResult,
} from './printer.port';

/**
 * ADAPTER: simulated printer. Used when no real printer is available (CI,
 * non-Windows dev) so the full agent loop runs and is testable everywhere.
 * Consumable levels gently deplete to exercise the health gate.
 */
export class SimulatorPrinterAdapter implements PrinterPort {
  readonly platform = 'simulator';
  private paper = 200;
  private ink = 100;
  private toner = 100;

  private readonly printer: DetectedPrinter = {
    name: 'Print Karo Virtual Printer',
    isDefault: true,
    state: PRINTER_STATES.READY,
    colorSupport: true,
    duplexSupport: true,
    paperSizes: ['A4', 'Letter', 'Legal'],
  };

  listPrinters(): Promise<DetectedPrinter[]> {
    return Promise.resolve([this.printer]);
  }

  getDefaultPrinter(): Promise<DetectedPrinter | null> {
    return Promise.resolve(this.printer);
  }

  getStatus(): Promise<PrinterStatus> {
    // Simulate slow consumable drain.
    this.ink = Math.max(0, this.ink - 0.1);
    this.toner = Math.max(0, this.toner - 0.05);

    return Promise.resolve({
      printerName: this.printer.name,
      state: this.paper > 0 ? PRINTER_STATES.READY : PRINTER_STATES.ERROR,
      paperRemaining: this.paper,
      paperSize: 'A4',
      colorAvailable: true,
      duplexAvailable: true,
      inkLevel: Math.round(this.ink),
      tonerLevel: Math.round(this.toner),
      errorCode: this.paper > 0 ? null : 'OUT_OF_PAPER',
    });
  }

  /** Simulated silent print: consumes paper and always succeeds when stocked. */
  print(request: PrintRequest): Promise<PrintResult> {
    if (this.paper <= 0) {
      return Promise.resolve({
        success: false,
        errorCode: 'OUT_OF_PAPER',
        errorMessage: 'Simulated printer is out of paper.',
      });
    }
    const sheets = Math.max(1, request.copies);
    this.paper = Math.max(0, this.paper - sheets);
    return Promise.resolve({ success: true, pagesPrinted: sheets });
  }
}
