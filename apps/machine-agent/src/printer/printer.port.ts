import type { PrinterState } from '@print-karo/types';

/**
 * PORT (Hexagonal Architecture): the hardware-agnostic printer contract.
 *
 * Every platform (Windows, Raspberry Pi/CUPS, Industrial PC) provides an
 * ADAPTER implementing this interface. The agent core depends ONLY on this
 * port, so swapping a Windows laptop for a Raspberry Pi changes the adapter
 * selection and nothing else — the backend protocol is identical.
 *
 * Sprint 3 covered detection + status only. Sprint 4 adds `print(job)` — the
 * one place hardware actually differs — so the agent core, api client and
 * heartbeat builder remain identical on Windows and Pi.
 */
export interface DetectedPrinter {
  name: string;
  isDefault: boolean;
  state: PrinterState;
  colorSupport: boolean;
  duplexSupport: boolean;
  paperSizes: string[];
}

/** A silent print request handed to the adapter by the PrintRunner. */
export interface PrintRequest {
  /** Absolute path to the downloaded PDF in a temp folder. */
  filePath: string;
  copies: number;
  /** "BW" | "COLOR" */
  colorMode: string;
  duplex: boolean;
  paperSize: string;
  /** null = all pages, else e.g. "1-3,5". */
  pageRange: string | null;
}

export interface PrintResult {
  success: boolean;
  pagesPrinted?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface PrinterStatus {
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

export interface PrinterPort {
  /** A short id for the platform implementation (for logs/diagnostics). */
  readonly platform: string;

  /** Enumerate installed printers. */
  listPrinters(): Promise<DetectedPrinter[]>;

  /** Resolve the default/active printer, or null if none. */
  getDefaultPrinter(): Promise<DetectedPrinter | null>;

  /** Current live status of the active printer. */
  getStatus(): Promise<PrinterStatus>;

  /** Silently print a downloaded document. The agent deletes the temp file after. */
  print(request: PrintRequest): Promise<PrintResult>;
}
