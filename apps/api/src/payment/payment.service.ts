import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  AUDIT_ACTIONS,
  PAYMENT_RESULTS,
  PAYMENT_STATUSES,
  type PaymentResponse,
  type PaymentResult,
} from '@print-karo/types';
import type { Payment } from '@print-karo/database';
import { PaymentRepository } from './payment.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider';
import { OrderService } from '../order/order.service';
import { AuditService } from '../audit/audit.service';
import { getDeviceInfo } from '../common/device-info';
import type { AuthPrincipal } from '../rbac/auth-context';

/**
 * Payment orchestration. ALL business logic lives here — the provider only talks
 * to the gateway. On a successful charge it transitions the order to PAID (which
 * mints the PIN and dispatches the job); on failure it records the failure; on
 * refund it reverses the order. Provider-agnostic.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly repo: PaymentRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(forwardRef(() => OrderService)) private readonly orders: OrderService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Begin payment for an order awaiting it. Idempotent per order (1:1 Payment). */
  async initiate(actor: AuthPrincipal, orderId: string, req: Request): Promise<PaymentResponse> {
    const order = await this.orders.loadOwnedForPayment(actor, orderId);

    const existing = await this.repo.findByOrderId(orderId);
    if (existing && existing.status === PAYMENT_STATUSES.SUCCEEDED) {
      throw new ConflictException('Order already paid.');
    }

    const providerOrder = await this.provider.createOrder(
      order.amountPaise,
      order.currency,
      order.orderNumber,
    );

    const payment =
      existing ??
      (await this.repo.create({
        orderId,
        provider: this.provider.name,
        status: PAYMENT_STATUSES.PENDING,
        amountPaise: order.amountPaise,
        currency: order.currency,
      }));

    const updated = await this.repo.update(payment.id, {
      status: PAYMENT_STATUSES.PROCESSING,
      providerOrderId: providerOrder.providerOrderId,
    });

    await this.orders.markPaymentPending(orderId);

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.ORDER_PAYMENT_INITIATED,
      actorUserId: actor.userId,
      targetType: 'Order',
      targetId: orderId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { paymentId: payment.id, amountPaise: order.amountPaise },
    });

    return this.toResponse(updated);
  }

  /**
   * Drive the (demo) charge with a requested outcome. On SUCCESS the order is
   * marked PAID; otherwise the payment fails/cancels and the order returns to a
   * payable state.
   */
  async simulate(
    actor: AuthPrincipal,
    orderId: string,
    outcome: PaymentResult,
    req: Request,
  ): Promise<PaymentResponse> {
    await this.orders.loadOwnedForPayment(actor, orderId);

    const payment = await this.repo.findByOrderId(orderId);
    if (!payment || !payment.providerOrderId) {
      throw new BadRequestException('Payment has not been initiated for this order.');
    }
    if (payment.status === PAYMENT_STATUSES.SUCCEEDED) {
      throw new ConflictException('Order already paid.');
    }

    const charge = await this.provider.charge(
      payment.providerOrderId,
      payment.amountPaise,
      outcome,
    );

    await this.repo.addTransaction({
      paymentId: payment.id,
      type: 'CHARGE',
      result: charge.result,
      providerRef: charge.providerPaymentId,
      amountPaise: payment.amountPaise,
      rawResponse: charge.raw as never,
    });

    const device = getDeviceInfo(req);

    if (charge.result === PAYMENT_RESULTS.SUCCESS) {
      const updated = await this.repo.update(payment.id, {
        status: PAYMENT_STATUSES.SUCCEEDED,
        providerPaymentId: charge.providerPaymentId,
      });
      await this.audit.record({
        action: AUDIT_ACTIONS.ORDER_PAID,
        actorUserId: actor.userId,
        targetType: 'Order',
        targetId: orderId,
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
        metadata: { paymentId: payment.id },
      });
      // PAID transition mints the PIN + dispatches the print job.
      await this.orders.markPaid(orderId);
      return this.toResponse(updated);
    }

    const failureReason = `Payment ${charge.result.toLowerCase()}`;
    const updated = await this.repo.update(payment.id, {
      status:
        charge.result === PAYMENT_RESULTS.CANCELLED
          ? PAYMENT_STATUSES.CANCELLED
          : PAYMENT_STATUSES.FAILED,
      failureReason,
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.ORDER_PAYMENT_FAILED,
      actorUserId: actor.userId,
      targetType: 'Order',
      targetId: orderId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { result: charge.result },
    });
    await this.orders.markPaymentFailed(orderId, failureReason);
    return this.toResponse(updated);
  }

  async getForOrder(actor: AuthPrincipal, orderId: string): Promise<PaymentResponse | null> {
    await this.orders.loadOwnedForPayment(actor, orderId);
    const payment = await this.repo.findByOrderId(orderId);
    return payment ? this.toResponse(payment) : null;
  }

  /** Admin-initiated refund of a successful payment. */
  async refund(
    actor: AuthPrincipal,
    paymentId: string,
    reason: string | undefined,
    req: Request,
  ): Promise<PaymentResponse> {
    const payment = await this.repo.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PAYMENT_STATUSES.SUCCEEDED) {
      throw new ConflictException('Only succeeded payments can be refunded.');
    }
    if (!payment.providerPaymentId) {
      throw new ConflictException('Payment has no provider payment id to refund.');
    }

    const refund = await this.provider.refund(payment.providerPaymentId, payment.amountPaise);
    await this.repo.addTransaction({
      paymentId: payment.id,
      type: 'REFUND',
      result: PAYMENT_RESULTS.SUCCESS,
      providerRef: refund.providerRef,
      amountPaise: payment.amountPaise,
      rawResponse: refund.raw as never,
    });
    const updated = await this.repo.update(payment.id, {
      status: PAYMENT_STATUSES.REFUNDED,
      refundedAt: new Date(),
    });

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.REFUND_ISSUED,
      actorUserId: actor.userId,
      targetType: 'Order',
      targetId: payment.orderId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { paymentId: payment.id, reason },
    });
    await this.orders.markRefunded(payment.orderId, reason);
    return this.toResponse(updated);
  }

  private toResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      status: payment.status,
      amountPaise: payment.amountPaise,
      currency: payment.currency,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString(),
    };
  }
}
