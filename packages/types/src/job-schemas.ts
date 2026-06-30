import { z } from 'zod';
import type { COLOR_MODES } from './pricing-schemas';

/**
 * Print job dispatch domain (Sprint 4). The DB-backed PrintJob queue dispatches
 * a job to a machine; the agent downloads the file via a presigned GET URL,
 * prints silently, then reports the result. Identical payload on Windows and Pi.
 */

export const PRINT_JOB_STATUSES = {
  QUEUED: 'QUEUED',
  DISPATCHED: 'DISPATCHED',
  CLAIMED: 'CLAIMED',
  PRINTING: 'PRINTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  DEAD_LETTER: 'DEAD_LETTER',
} as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[keyof typeof PRINT_JOB_STATUSES];

/** Print options carried in a dispatched job. */
export interface MachineJobPrintOptions {
  copies: number;
  colorMode: (typeof COLOR_MODES)[keyof typeof COLOR_MODES];
  duplex: boolean;
  paperSize: string;
  pageRange: string | null;
}

/**
 * A dispatched print job, returned to the agent from GET /machine/jobs (and from
 * POST /machine/pin/redeem). The downloadUrl is a short-lived presigned GET.
 */
export interface MachineJob {
  jobId: string;
  orderId: string;
  orderNumber: string;
  /** Presigned GET URL for the document — never a bucket URL. */
  downloadUrl: string;
  /** sha256 of the file the agent must verify after download. */
  checksum: string;
  printOptions: MachineJobPrintOptions;
  /** Job/URL expiry — the agent must finish before this. */
  expiresAt: string;
}

// ── Report a print result (machine) ──────────────────────────────────
export const reportPrintResultSchema = z.object({
  jobId: z.string().min(1),
  success: z.boolean(),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(500).optional(),
  pagesPrinted: z.number().int().min(0).optional(),
});
export type ReportPrintResultInput = z.infer<typeof reportPrintResultSchema>;
