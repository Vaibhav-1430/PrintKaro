import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PRINTER_STATES, type PrinterState } from '@print-karo/types';
import type {
  DetectedPrinter,
  PrinterPort,
  PrinterStatus,
  PrintRequest,
  PrintResult,
} from './printer.port';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * ADAPTER: Raspberry Pi / Linux printer detection via CUPS (lpstat).
 *
 * This proves the hexagonal design: the Pi build selects THIS adapter and
 * nothing else changes — same agent core, same backend protocol. Implemented
 * against the standard CUPS CLI; consumable depth (SNMP) lands with printing
 * in Sprint 4, exactly as on Windows.
 */
export class CupsPrinterAdapter implements PrinterPort {
  readonly platform = 'linux-cups';

  private mapState(raw: string): PrinterState {
    if (/disabled|offline/i.test(raw)) return PRINTER_STATES.OFFLINE;
    if (/printing|processing/i.test(raw)) return PRINTER_STATES.BUSY;
    if (/idle|enabled/i.test(raw)) return PRINTER_STATES.READY;
    return PRINTER_STATES.UNKNOWN;
  }

  async listPrinters(): Promise<DetectedPrinter[]> {
    try {
      const { stdout } = await execAsync('lpstat -p -d', { timeout: 10_000 });
      const defaultMatch = /system default destination:\s*(\S+)/i.exec(stdout);
      const defaultName = defaultMatch?.[1];
      const printers: DetectedPrinter[] = [];
      for (const line of stdout.split('\n')) {
        const m = /^printer\s+(\S+)\s+(.*)$/i.exec(line.trim());
        if (m && m[1]) {
          printers.push({
            name: m[1],
            isDefault: m[1] === defaultName,
            state: this.mapState(m[2] ?? ''),
            colorSupport: true,
            duplexSupport: true,
            paperSizes: ['A4', 'Letter'],
          });
        }
      }
      return printers;
    } catch {
      return [];
    }
  }

  async getDefaultPrinter(): Promise<DetectedPrinter | null> {
    const printers = await this.listPrinters();
    return printers.find((p) => p.isDefault) ?? printers[0] ?? null;
  }

  async getStatus(): Promise<PrinterStatus> {
    const def = await this.getDefaultPrinter();
    if (!def) {
      return {
        printerName: null,
        state: PRINTER_STATES.OFFLINE,
        paperRemaining: null,
        paperSize: null,
        colorAvailable: false,
        duplexAvailable: false,
        inkLevel: null,
        tonerLevel: null,
        errorCode: 'NO_PRINTER',
      };
    }
    return {
      printerName: def.name,
      state: def.state,
      paperRemaining: null,
      paperSize: 'A4',
      colorAvailable: def.colorSupport,
      duplexAvailable: def.duplexSupport,
      inkLevel: null,
      tonerLevel: null,
      errorCode: def.state === PRINTER_STATES.OFFLINE ? 'PRINTER_OFFLINE' : null,
    };
  }

  /** Silently print a PDF via the CUPS `lp` command on the default printer. */
  async print(request: PrintRequest): Promise<PrintResult> {
    const def = await this.getDefaultPrinter();
    if (!def) {
      return { success: false, errorCode: 'NO_PRINTER', errorMessage: 'No default printer.' };
    }
    const args = [
      '-d',
      def.name,
      '-n',
      String(Math.max(1, request.copies)),
      '-o',
      `media=${request.paperSize}`,
      '-o',
      request.duplex ? 'sides=two-sided-long-edge' : 'sides=one-sided',
    ];
    if (request.pageRange) args.push('-o', `page-ranges=${request.pageRange}`);
    args.push(request.filePath);

    try {
      await execFileAsync('lp', args, { timeout: 60_000 });
      return { success: true, pagesPrinted: Math.max(1, request.copies) };
    } catch (err) {
      return {
        success: false,
        errorCode: 'PRINT_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
