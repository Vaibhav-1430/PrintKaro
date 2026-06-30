import { z } from 'zod';

/**
 * Payment domain (Sprint 4). DEMO ONLY — a PaymentSimulator behind a
 * provider-agnostic interface. Razorpay drops in for Sprint 5 with no
 * business-logic change. All money is integer paise.
 */

export const PAYMENT_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES];

export const PAYMENT_RESULTS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentResult = (typeof PAYMENT_RESULTS)[keyof typeof PAYMENT_RESULTS];

// ── Initiate payment (customer) ──────────────────────────────────────
export const initiatePaymentSchema = z.object({}).strict();
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

// ── Simulate payment outcome (customer demo button) ──────────────────
// The demo UI offers Pay / Fail / Timeout / Cancel; default is SUCCESS.
export const simulatePaymentSchema = z.object({
  outcome: z.nativeEnum(PAYMENT_RESULTS).default(PAYMENT_RESULTS.SUCCESS),
});
export type SimulatePaymentInput = z.infer<typeof simulatePaymentSchema>;

// ── Refund (admin) ───────────────────────────────────────────────────
export const refundSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;

// ── Response DTOs ────────────────────────────────────────────────────
export interface PaymentResponse {
  id: string;
  orderId: string;
  provider: string;
  status: PaymentStatus;
  amountPaise: number;
  currency: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  failureReason: string | null;
  createdAt: string;
}
