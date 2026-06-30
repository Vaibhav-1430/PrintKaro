import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PAYMENT_RESULTS, type PaymentResult } from '@print-karo/types';
import type {
  ChargeOutcome,
  CreatedProviderOrder,
  PaymentProvider,
  RefundOutcome,
} from './payment.provider';

/**
 * Demo payment simulator. Deterministic: the outcome is whatever the caller
 * requests (default SUCCESS), so the customer's demo Pay/Fail/Timeout/Cancel
 * buttons map directly to results. Generates sim_* transaction ids. Contains NO
 * business logic — that all lives in PaymentService.
 */
export class PaymentSimulator implements PaymentProvider {
  readonly name = 'simulator';
  private readonly logger = new Logger(PaymentSimulator.name);

  private id(prefix: string): string {
    return `sim_${prefix}_${randomBytes(8).toString('hex')}`;
  }

  createOrder(
    amountPaise: number,
    currency: string,
    reference: string,
  ): Promise<CreatedProviderOrder> {
    const providerOrderId = this.id('order');
    this.logger.debug(
      `Simulated order ${providerOrderId} for ${amountPaise} ${currency} (ref=${reference})`,
    );
    return Promise.resolve({ providerOrderId });
  }

  charge(
    providerOrderId: string,
    amountPaise: number,
    requestedOutcome: PaymentResult = PAYMENT_RESULTS.SUCCESS,
  ): Promise<ChargeOutcome> {
    const isSuccess = requestedOutcome === PAYMENT_RESULTS.SUCCESS;
    const providerPaymentId = isSuccess ? this.id('pay') : null;
    return Promise.resolve({
      result: requestedOutcome,
      providerPaymentId,
      raw: { providerOrderId, amountPaise, simulated: true, outcome: requestedOutcome },
    });
  }

  refund(providerPaymentId: string, amountPaise: number): Promise<RefundOutcome> {
    const providerRef = this.id('refund');
    return Promise.resolve({
      providerRef,
      raw: { providerPaymentId, amountPaise, simulated: true },
    });
  }
}
