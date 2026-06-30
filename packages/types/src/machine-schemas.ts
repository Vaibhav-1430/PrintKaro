import { z } from 'zod';
import {
  MACHINE_LOG_EVENTS,
  MACHINE_LOG_LEVELS,
  MACHINE_RUNTIME_STATES,
  MACHINE_TYPES,
  PRINTER_STATES,
  type HealthGateResult,
  type MachineLifecycleStatus,
  type MachineRuntimeState,
  type MachineType,
  type PrinterState,
} from './machine';
import type { MachineJob } from './job-schemas';

const percent = z.number().min(0).max(100);

// ── Registration (admin) ─────────────────────────────────────────────

export const registerMachineSchema = z.object({
  name: z.string().trim().min(1, 'Machine name is required.').max(120),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,40}$/, 'Code must be uppercase letters, numbers and hyphens.'),
  type: z.nativeEnum(MACHINE_TYPES).default(MACHINE_TYPES.WINDOWS),
  operatorProfileId: z.string().uuid().optional(),

  college: z.string().trim().max(160).optional(),
  building: z.string().trim().max(160).optional(),
  floor: z.string().trim().max(60).optional(),
  room: z.string().trim().max(60).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),

  printerName: z.string().trim().max(160).optional(),
  colorSupport: z.boolean().default(false),
  duplexSupport: z.boolean().default(false),
  paperSizes: z.array(z.string().trim().min(1)).default(['A4']),
});
export type RegisterMachineInput = z.infer<typeof registerMachineSchema>;

// ── Heartbeat (machine) ──────────────────────────────────────────────

export const heartbeatSchema = z.object({
  runtimeState: z.nativeEnum(MACHINE_RUNTIME_STATES),
  printerState: z.nativeEnum(PRINTER_STATES).default(PRINTER_STATES.UNKNOWN),
  printerName: z.string().max(160).optional(),

  cpuUsage: percent.optional(),
  ramUsage: percent.optional(),
  diskUsage: percent.optional(),
  temperature: z.number().min(-50).max(150).optional(),

  networkOnline: z.boolean().default(true),
  internet: z.boolean().default(false),

  paperRemaining: z.number().int().min(0).optional(),
  paperSize: z.string().max(20).optional(),
  colorAvailable: z.boolean().default(false),
  duplexAvailable: z.boolean().default(false),
  inkLevel: percent.optional(),
  tonerLevel: percent.optional(),

  currentJobId: z.string().max(64).optional(),
  errorCode: z.string().max(64).optional(),

  timestamp: z.string().datetime(),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

// ── Log upload (machine) ─────────────────────────────────────────────

export const machineLogSchema = z.object({
  level: z.nativeEnum(MACHINE_LOG_LEVELS).default(MACHINE_LOG_LEVELS.INFO),
  event: z.nativeEnum(MACHINE_LOG_EVENTS),
  message: z.string().max(2000).optional(),
  context: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime(),
});
export type MachineLogInput = z.infer<typeof machineLogSchema>;

export const machineLogBatchSchema = z.object({
  logs: z.array(machineLogSchema).min(1).max(100),
});
export type MachineLogBatchInput = z.infer<typeof machineLogBatchSchema>;

// ── Queue (machine) ──────────────────────────────────────────────────

export const jobAcceptSchema = z.object({ jobId: z.string().min(1) });
export type JobAcceptInput = z.infer<typeof jobAcceptSchema>;

export const jobRejectSchema = z.object({
  jobId: z.string().min(1),
  reason: z.string().max(500).optional(),
});
export type JobRejectInput = z.infer<typeof jobRejectSchema>;

// ── Admin actions ────────────────────────────────────────────────────

export const suspendMachineSchema = z.object({ reason: z.string().max(500).optional() });
export type SuspendMachineInput = z.infer<typeof suspendMachineSchema>;

// ── Response DTOs ────────────────────────────────────────────────────

export interface MachineRegistrationResult {
  id: string;
  code: string;
  /** Plaintext secret — returned exactly ONCE at registration. */
  machineSecret: string;
}

export interface MachineConfigResponse {
  machineId: string;
  heartbeatIntervalSec: number;
  queuePollIntervalSec: number;
  logUploadIntervalSec: number;
  maintenanceMode: boolean;
  capabilities: {
    colorSupport: boolean;
    duplexSupport: boolean;
    paperSizes: string[];
    maxCopies: number;
  };
  settings: Record<string, unknown> | null;
}

export interface MachineHealthResponse {
  machineId: string;
  runtimeState: MachineRuntimeState;
  printerState: PrinterState;
  healthScore: number;
  gateResult: HealthGateResult;
  blockingReasons: string[];
  checks: {
    printerConnected: boolean;
    paperAvailable: boolean;
    consumablesOk: boolean;
    internet: boolean;
    heartbeatFresh: boolean;
  };
  lastHeartbeatAt: string | null;
  updatedAt: string;
}

/**
 * GET /machine/jobs (and POST /machine/pin/redeem) — returns the next dispatched
 * job for the calling machine, or none. Widened in Sprint 4 to carry a MachineJob.
 */
export interface MachineJobsResponse {
  hasJob: boolean;
  job: MachineJob | null;
}

export interface MachineSummary {
  id: string;
  code: string;
  name: string;
  type: MachineType;
  status: MachineLifecycleStatus;
  runtimeState: MachineRuntimeState;
  gateResult: HealthGateResult;
  healthScore: number;
  printerState: PrinterState;
  location: { college: string | null; building: string | null; room: string | null };
  operatorName: string | null;
  lastHeartbeatAt: string | null;
  online: boolean;
}
