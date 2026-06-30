import { z } from 'zod';
import { COLOR_MODES, ORIENTATIONS, PAPER_SIZES } from './pricing-schemas';

/**
 * Order domain (Sprint 4) — the spine of the print pipeline. The lifecycle is a
 * strict state machine; the transition map below is the single source of truth
 * shared by FE and BE, and `canTransition` is a pure guard used in tests and the
 * OrderService.
 */

export const ORDER_STATUSES = {
  DRAFT: 'DRAFT',
  UPLOADED: 'UPLOADED',
  VALIDATED: 'VALIDATED',
  MACHINE_READY: 'MACHINE_READY',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  PIN_GENERATED: 'PIN_GENERATED',
  WAITING_AT_MACHINE: 'WAITING_AT_MACHINE',
  PRINTING: 'PRINTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

const S = ORDER_STATUSES;

/**
 * Allowed transitions. A status maps to the set of statuses reachable from it.
 * Terminal states (COMPLETED, EXPIRED, REFUNDED, CANCELLED) have no outgoing
 * transitions. FAILED may be refunded.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [S.DRAFT]: [S.UPLOADED, S.CANCELLED],
  [S.UPLOADED]: [S.VALIDATED, S.FAILED, S.CANCELLED],
  [S.VALIDATED]: [S.MACHINE_READY, S.CANCELLED],
  [S.MACHINE_READY]: [S.PAYMENT_PENDING, S.CANCELLED],
  [S.PAYMENT_PENDING]: [S.PAID, S.FAILED, S.CANCELLED],
  [S.PAID]: [S.PIN_GENERATED, S.REFUNDED],
  [S.PIN_GENERATED]: [S.WAITING_AT_MACHINE, S.EXPIRED, S.REFUNDED],
  [S.WAITING_AT_MACHINE]: [S.PRINTING, S.EXPIRED, S.REFUNDED],
  [S.PRINTING]: [S.COMPLETED, S.FAILED],
  [S.COMPLETED]: [],
  [S.FAILED]: [S.REFUNDED],
  [S.EXPIRED]: [S.REFUNDED],
  [S.REFUNDED]: [],
  [S.CANCELLED]: [],
} as const;

/** Pure guard: is `to` reachable from `from` in one step? */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Terminal states carry no further transitions. */
export function isTerminalStatus(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

// ── Print options (set on an order) ──────────────────────────────────
export const printOptionSchema = z.object({
  copies: z.number().int().min(1).max(500),
  colorMode: z.nativeEnum(COLOR_MODES).default(COLOR_MODES.BW),
  duplex: z.boolean().default(false),
  paperSize: z.enum(PAPER_SIZES).default('A4'),
  orientation: z.enum(ORIENTATIONS).default('portrait'),
  // null/undefined = all pages, else e.g. "1-3,5,7-9".
  pageRange: z
    .string()
    .regex(/^\d+(-\d+)?(,\d+(-\d+)?)*$/, 'Invalid page range.')
    .max(200)
    .optional(),
});
export type PrintOptionInput = z.infer<typeof printOptionSchema>;

// ── Create an order ──────────────────────────────────────────────────
export const createOrderSchema = z.object({
  uploadId: z.string().uuid(),
  machineId: z.string().uuid(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ── Response DTOs ────────────────────────────────────────────────────
export interface OrderPrintOptionResponse {
  copies: number;
  colorMode: string;
  duplex: boolean;
  paperSize: string;
  orientation: string;
  pageRange: string | null;
  pagesToPrint: number;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  amountPaise: number;
  currency: string;
  uploadId: string;
  machineId: string;
  printOption: OrderPrintOptionResponse | null;
  paymentStatus: string | null;
  pinStatus: string | null;
  pinExpiresAt: string | null;
  failureReason: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  amountPaise: number;
  currency: string;
  machineId: string;
  createdAt: string;
}

export interface RevenueSummary {
  totalOrders: number;
  paidOrders: number;
  completedOrders: number;
  refundedOrders: number;
  grossRevenuePaise: number;
  refundedPaise: number;
  netRevenuePaise: number;
  currency: string;
}
