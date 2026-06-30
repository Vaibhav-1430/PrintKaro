import type { PaymentResult } from '@print-karo/types';

/**
 * Payment provider port (hexagonal). The PaymentService contains ALL business
 * logic; the provider only talks to the gateway. Sprint 4 binds PaymentSimulator;
 * Sprint 5 binds a Razorpay adapter implementing this same interface with no
 * change to the service.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatedProviderOrder {
  providerOrderId: string;
}

export interface ChargeOutcome {
  result: PaymentResult;
  providerPaymentId: string | null;
  raw: Record<string, unknown>;
}

export interface RefundOutcome {
  providerRef: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;

  /** Create a provider-side order to be charged. */
  createOrder(
    amountPaise: number,
    currency: string,
    reference: string,
  ): Promise<CreatedProviderOrder>;

  /**
   * Attempt the charge. `requestedOutcome` lets the demo simulator drive a
   * specific result; a real gateway ignores it and returns the actual outcome.
   */
  charge(
    providerOrderId: string,
    amountPaise: number,
    requestedOutcome?: PaymentResult,
  ): Promise<ChargeOutcome>;

  /** Refund a previously-successful payment. */
  refund(providerPaymentId: string, amountPaise: number): Promise<RefundOutcome>;
}
