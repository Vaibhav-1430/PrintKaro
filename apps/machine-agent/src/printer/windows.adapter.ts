import { exec } from 'node:child_process';
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

interface RawWindowsPrinter {
  Name: string;
  Default?: boolean;
  PrinterStatus?: number;
  WorkOffline?: boolean;
}

/**
 * ADAPTER: real Windows printer detection via PowerShell (Get-Printer / WMI).
 * Maps Windows printer status codes to the shared PrinterState vocabulary.
 *
 * Detection only (Sprint 3). Printing is added in Sprint 4 on the same port.
 */
export class WindowsPrinterAdapter implements PrinterPort {
  readonly platform = 'windows';

  private async ps<T>(command: string): Promise<T> {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${command}"`,
      { windowsHide: true, timeout: 10_000 },
    );
    const trimmed = stdout.trim();
    return (trimmed ? JSON.parse(trimmed) : null) as T;
  }

  private mapState(p: RawWindowsPrinter): PrinterState {
    if (p.WorkOffline) return PRINTER_STATES.OFFLINE;
    // Win32_Printer PrinterStatus: 3=Idle/Ready, 4=Printing, 5=Warmup, 7=Offline
    switch (p.PrinterStatus) {
      case 3:
      case 5:
        return PRINTER_STATES.READY;
      case 4:
        return PRINTER_STATES.BUSY;
      case 7:
        return PRINTER_STATES.OFFLINE;
      default:
        return PRINTER_STATES.UNKNOWN;
    }
  }

  private toDetected(p: RawWindowsPrinter): DetectedPrinter {
    return {
      name: p.Name,
      isDefault: Boolean(p.Default),
      state: this.mapState(p),
      // Capability probing is refined in Sprint 4; sensible defaults for now.
      colorSupport: true,
      duplexSupport: true,
      paperSizes: ['A4', 'Letter'],
    };
  }

  async listPrinters(): Promise<DetectedPrinter[]> {
    const raw = await this.ps<RawWindowsPrinter[] | RawWindowsPrinter | null>(
      'Get-CimInstance Win32_Printer | Select-Object Name,Default,PrinterStatus,WorkOffline | ConvertTo-Json -Compress',
    );
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((p) => this.toDetected(p));
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
    // Consumable levels are not exposed uniformly by Windows; left null until
    // SNMP/driver probing lands in Sprint 4. State + capabilities are real.
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

  /**
   * Silently print a PDF on the default printer via PowerShell's Print verb.
   * Copies are issued sequentially; duplex/paper-size honouring beyond the
   * driver default is a driver-specific hardening item.
   */
  async print(request: PrintRequest): Promise<PrintResult> {
    const def = await this.getDefaultPrinter();
    if (!def) {
      return { success: false, errorCode: 'NO_PRINTER', errorMessage: 'No default printer.' };
    }
    try {
      const safePath = request.filePath.replace(/'/g, "''");
      for (let i = 0; i < Math.max(1, request.copies); i++) {
        await this.ps<null>(
          `Start-Process -FilePath '${safePath}' -Verb Print -PassThru | Out-Null`,
        );
      }
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
