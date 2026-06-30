/**
 * Machine infrastructure enums + constants (Sprint 3).
 * Mirror the Prisma enums so FE/BE/agent share one vocabulary. The backend is
 * agnostic to MachineType — a Windows PC and a Raspberry Pi use the same protocol.
 */

export const MACHINE_RUNTIME_STATES = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  BOOTING: 'BOOTING',
  IDLE: 'IDLE',
  PRINTING: 'PRINTING',
  PAUSED: 'PAUSED',
  ERROR: 'ERROR',
  OUT_OF_PAPER: 'OUT_OF_PAPER',
  PAPER_JAM: 'PAPER_JAM',
  PRINTER_OFFLINE: 'PRINTER_OFFLINE',
  LOW_INK: 'LOW_INK',
  LOW_TONER: 'LOW_TONER',
  MAINTENANCE: 'MAINTENANCE',
} as const;
export type MachineRuntimeState =
  (typeof MACHINE_RUNTIME_STATES)[keyof typeof MACHINE_RUNTIME_STATES];

export const MACHINE_TYPES = {
  WINDOWS: 'WINDOWS',
  RASPBERRY_PI: 'RASPBERRY_PI',
  INDUSTRIAL_PC: 'INDUSTRIAL_PC',
} as const;
export type MachineType = (typeof MACHINE_TYPES)[keyof typeof MACHINE_TYPES];

export const PRINTER_STATES = {
  READY: 'READY',
  BUSY: 'BUSY',
  PAUSED: 'PAUSED',
  OFFLINE: 'OFFLINE',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type PrinterState = (typeof PRINTER_STATES)[keyof typeof PRINTER_STATES];

export const HEALTH_GATE_RESULTS = {
  READY: 'READY',
  WARNING: 'WARNING',
  BLOCKED: 'BLOCKED',
} as const;
export type HealthGateResult = (typeof HEALTH_GATE_RESULTS)[keyof typeof HEALTH_GATE_RESULTS];

export const MACHINE_LIFECYCLE_STATUSES = {
  PROVISIONING: 'PROVISIONING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DECOMMISSIONED: 'DECOMMISSIONED',
} as const;
export type MachineLifecycleStatus =
  (typeof MACHINE_LIFECYCLE_STATUSES)[keyof typeof MACHINE_LIFECYCLE_STATUSES];

export const MACHINE_LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;
export type MachineLogLevel = (typeof MACHINE_LOG_LEVELS)[keyof typeof MACHINE_LOG_LEVELS];

export const MACHINE_LOG_EVENTS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  HEARTBEAT: 'HEARTBEAT',
  PRINT_START: 'PRINT_START',
  PRINT_SUCCESS: 'PRINT_SUCCESS',
  PRINT_FAILURE: 'PRINT_FAILURE',
  RESTART: 'RESTART',
  RECONNECT: 'RECONNECT',
  SHUTDOWN: 'SHUTDOWN',
  CRASH: 'CRASH',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  JOB_ACCEPTED: 'JOB_ACCEPTED',
  JOB_REJECTED: 'JOB_REJECTED',
  CONFIG_FETCHED: 'CONFIG_FETCHED',
} as const;
export type MachineLogEvent = (typeof MACHINE_LOG_EVENTS)[keyof typeof MACHINE_LOG_EVENTS];

/** Default heartbeat cadence + the staleness window (offline after this). */
export const HEARTBEAT_INTERVAL_SEC = 30;
export const HEARTBEAT_STALE_AFTER_SEC = 75; // 2.5 missed beats
