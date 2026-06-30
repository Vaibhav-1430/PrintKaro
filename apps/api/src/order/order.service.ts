import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AUDIT_ACTIONS,
  HEALTH_GATE_RESULTS,
  ORDER_STATUSES,
  ROLES,
  type CreateOrderInput,
  type OrderListItem,
  type OrderResponse,
  type OrderStatus,
  type PrintOptionInput,
  type RevenueSummary,
} from '@print-karo/types';
import type { Order, Prisma } from '@print-karo/database';
import { OrderRepository } from './order.repository';
import { OrderQueueService } from './order-queue.service';
import { assertTransition } from './order-state-machine';
import { PricingService } from '../pricing/pricing.service';
import { PinService } from '../pin/pin.service';
import { NotificationService } from '../notification/notification.service';
import { MachineHeartbeatService } from '../machine/machine-heartbeat.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { getDeviceInfo } from '../common/device-info';
import { countPagesInRange } from './page-range';
import type { AuthPrincipal } from '../rbac/auth-context';

type OrderRow = Awaited<ReturnType<OrderRepository['findById']>>;

/**
 * The order lifecycle owner. Every status change passes through assertTransition
 * + an audit record. Enforces customer ownership and the machine health gate
 * (BLOCKED machines cannot be paid). On PAID it mints a PIN and dispatches the
 * print job; print results drive COMPLETED/FAILED and expire the PIN.
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly queue: OrderQueueService,
    private readonly pricing: PricingService,
    private readonly pins: PinService,
    private readonly notifications: NotificationService,
    private readonly health: MachineHeartbeatService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Customer flow ───────────────────────────────────────────────────

  async createOrder(
    actor: AuthPrincipal,
    input: CreateOrderInput,
    req: Request,
  ): Promise<OrderResponse> {
    const customerProfileId = await this.customerProfileId(actor);

    const upload = await this.prisma.client.upload.findFirst({
      where: { id: input.uploadId, customerProfileId, deletedAt: null },
      include: { metadata: true },
    });
    if (!upload) throw new NotFoundException('Upload not found');
    if (upload.status !== 'VALIDATED') {
      throw new BadRequestException('Upload has not been validated yet.');
    }

    const machine = await this.prisma.client.machine.findFirst({
      where: { id: input.machineId, deletedAt: null },
    });
    if (!machine) throw new NotFoundException('Machine not found');

    const order = await this.repo.create({
      orderNumber: this.newOrderNumber(),
      customerProfileId,
      userId: actor.userId,
      uploadId: upload.id,
      machineId: machine.id,
      status: ORDER_STATUSES.UPLOADED,
    });

    await this.recordTransition(order.id, AUDIT_ACTIONS.ORDER_CREATED, actor.userId, req);
    // The upload is already validated, so reflect that immediately.
    await this.transition(order.id, ORDER_STATUSES.UPLOADED, ORDER_STATUSES.VALIDATED);
    await this.recordTransition(order.id, AUDIT_ACTIONS.ORDER_VALIDATED, actor.userId, req);

    await this.notifications.notify({
      userId: actor.userId,
      type: 'ORDER_CREATED',
      orderId: order.id,
      title: 'Order created',
      body: `Order ${order.orderNumber} is ready for print options.`,
    });

    return this.toResponse(await this.repo.findById(order.id));
  }

  async setOptions(
    actor: AuthPrincipal,
    orderId: string,
    input: PrintOptionInput,
  ): Promise<OrderResponse> {
    const order = await this.loadOwned(actor, orderId);
    this.assertEditable(order.status);

    const upload = await this.prisma.client.upload.findFirst({
      where: { id: order.uploadId },
      include: { metadata: true },
    });
    const totalPages = upload?.metadata?.pageCount ?? 1;
    const pagesToPrint = input.pageRange
      ? countPagesInRange(input.pageRange, totalPages)
      : totalPages;
    if (pagesToPrint <= 0) {
      throw new BadRequestException('Selected page range covers no pages.');
    }

    const breakdown = await this.pricing.calculate({
      machineId: order.machineId,
      copies: input.copies,
      colorMode: input.colorMode,
      duplex: input.duplex,
      paperSize: input.paperSize,
      pagesToPrint,
    });

    await this.repo.upsertPrintOption(order.id, {
      copies: input.copies,
      colorMode: input.colorMode,
      duplex: input.duplex,
      paperSize: input.paperSize,
      orientation: input.orientation,
      pageRange: input.pageRange ?? null,
      pagesToPrint,
    });
    await this.repo.update(order.id, { amountPaise: breakdown.totalPaise });

    return this.toResponse(await this.repo.findById(order.id));
  }

  /** Verify the chosen machine passes the health gate, then mark MACHINE_READY. */
  async verifyMachine(actor: AuthPrincipal, orderId: string, req: Request): Promise<OrderResponse> {
    const order = await this.loadOwned(actor, orderId);
    if (!order.printOption) {
      throw new BadRequestException('Choose print options before verifying the machine.');
    }

    const gate = await this.health.getHealth(order.machineId);
    // No health snapshot (machine never reported) is treated as BLOCKED.
    if (!gate || gate.gateResult === HEALTH_GATE_RESULTS.BLOCKED) {
      const reasons = gate?.blockingReasons.join(', ') || 'No recent heartbeat';
      throw new ConflictException(`Machine is not ready: ${reasons}`);
    }

    await this.transition(order.id, order.status, ORDER_STATUSES.MACHINE_READY);
    await this.recordTransition(order.id, AUDIT_ACTIONS.ORDER_MACHINE_VERIFIED, actor.userId, req, {
      gateResult: gate.gateResult,
    });
    // Move straight into PAYMENT_PENDING so the customer can pay.
    await this.transition(order.id, ORDER_STATUSES.MACHINE_READY, ORDER_STATUSES.PAYMENT_PENDING);
    return this.toResponse(await this.repo.findById(order.id));
  }

  async cancel(actor: AuthPrincipal, orderId: string, req: Request): Promise<OrderResponse> {
    const order = await this.loadOwned(actor, orderId);
    await this.transition(order.id, order.status, ORDER_STATUSES.CANCELLED);
    await this.recordTransition(order.id, AUDIT_ACTIONS.ORDER_CANCELLED, actor.userId, req);
    return this.toResponse(await this.repo.findById(order.id));
  }

  async getOrder(actor: AuthPrincipal, orderId: string): Promise<OrderResponse> {
    const order = await this.loadOwned(actor, orderId);
    return this.toResponse(order);
  }

  async listMine(actor: AuthPrincipal): Promise<OrderListItem[]> {
    const customerProfileId = await this.customerProfileId(actor);
    const orders = await this.repo.listForCustomer(customerProfileId);
    return orders.map((o) => this.toListItem(o));
  }

  // ── Payment-driven transitions (called by PaymentService) ───────────

  /** Used by PaymentService to load + ownership-check an order before charging. */
  async loadOwnedForPayment(actor: AuthPrincipal, orderId: string): Promise<Order> {
    const order = await this.loadOwned(actor, orderId);
    return order;
  }

  async markPaymentPending(orderId: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    if (order.status === ORDER_STATUSES.PAYMENT_PENDING) return;
    await this.transition(orderId, order.status, ORDER_STATUSES.PAYMENT_PENDING);
  }

  /** Charge succeeded → PAID → mint PIN → dispatch job → notify. */
  async markPaid(orderId: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    await this.transition(orderId, order.status, ORDER_STATUSES.PAID);
    await this.repo.update(orderId, { paidAt: new Date() });

    const mint = await this.pins.mint(orderId, order.machineId);
    await this.transition(orderId, ORDER_STATUSES.PAID, ORDER_STATUSES.PIN_GENERATED);
    await this.repo.update(orderId, { expiresAt: new Date(mint.expiresAt) });

    await this.queue.dispatch(orderId, order.machineId);

    await this.notifications.notify({
      userId: order.userId,
      type: 'PAYMENT_SUCCEEDED',
      orderId,
      title: 'Payment successful',
      body: `Your PIN is ${mint.pin}. Enter it at the machine within 6 hours.`,
    });
    await this.notifications.notify({
      userId: order.userId,
      type: 'PIN_GENERATED',
      orderId,
      title: 'Print PIN generated',
      body: `PIN ${mint.pin} expires at ${mint.expiresAt}.`,
    });
  }

  async markPaymentFailed(orderId: string, reason: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    // Keep the order payable: stay in PAYMENT_PENDING, just record the reason.
    await this.repo.update(orderId, { failureReason: reason });
    await this.notifications.notify({
      userId: order.userId,
      type: 'PAYMENT_FAILED',
      orderId,
      title: 'Payment failed',
      body: reason,
    });
  }

  async markRefunded(orderId: string, reason?: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    await this.transition(orderId, order.status, ORDER_STATUSES.REFUNDED);
    await this.repo.update(orderId, { failureReason: reason ?? 'Refunded' });
    await this.pins.expire(orderId);
    await this.notifications.notify({
      userId: order.userId,
      type: 'REFUND_ISSUED',
      orderId,
      title: 'Order refunded',
      body: reason ?? 'Your order has been refunded.',
    });
  }

  // ── Print-result transitions (called by MachineQueueService) ────────

  async markPrinting(orderId: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    if (order.status === ORDER_STATUSES.WAITING_AT_MACHINE) {
      await this.transition(orderId, order.status, ORDER_STATUSES.PRINTING);
      await this.audit.record({
        action: AUDIT_ACTIONS.PRINT_STARTED,
        actorType: 'MACHINE',
        targetType: 'Order',
        targetId: orderId,
      });
      await this.notifications.notify({
        userId: order.userId,
        type: 'PRINTING_STARTED',
        orderId,
        title: 'Printing started',
        body: `Order ${order.orderNumber} is printing.`,
      });
    }
  }

  /** Move an order to WAITING_AT_MACHINE when its PIN is redeemed. */
  async markWaitingAtMachine(orderId: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    await this.transition(orderId, order.status, ORDER_STATUSES.WAITING_AT_MACHINE);
  }

  async markCompleted(orderId: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    await this.transition(orderId, order.status, ORDER_STATUSES.COMPLETED);
    await this.repo.update(orderId, { printedAt: new Date(), completedAt: new Date() });
    await this.pins.expire(orderId);
    await this.audit.record({
      action: AUDIT_ACTIONS.ORDER_COMPLETED,
      actorType: 'MACHINE',
      targetType: 'Order',
      targetId: orderId,
    });
    await this.notifications.notify({
      userId: order.userId,
      type: 'PRINTING_COMPLETED',
      orderId,
      title: 'Printing completed',
      body: `Order ${order.orderNumber} is complete. Collect your prints.`,
    });
  }

  async markFailed(orderId: string, reason: string): Promise<void> {
    const order = await this.requireOrder(orderId);
    await this.transition(orderId, order.status, ORDER_STATUSES.FAILED);
    await this.repo.update(orderId, { failureReason: reason });
    await this.audit.record({
      action: AUDIT_ACTIONS.PRINT_FAILED,
      actorType: 'MACHINE',
      targetType: 'Order',
      targetId: orderId,
      metadata: { reason },
    });
    await this.notifications.notify({
      userId: order.userId,
      type: 'PRINTING_FAILED',
      orderId,
      title: 'Printing failed',
      body: reason,
    });
  }

  // ── Admin / operator read ───────────────────────────────────────────

  async listAll(actor: AuthPrincipal): Promise<OrderListItem[]> {
    const where = await this.scopeWhere(actor);
    const orders = await this.repo.listAll(where);
    return orders.map((o) => this.toListItem(o));
  }

  async adminGet(actor: AuthPrincipal, orderId: string): Promise<OrderResponse> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    await this.assertScope(actor, order.machineId);
    return this.toResponse(order);
  }

  async revenue(actor: AuthPrincipal): Promise<RevenueSummary> {
    const where = await this.scopeWhere(actor);
    const agg = await this.repo.revenue(where);
    return {
      ...agg,
      netRevenuePaise: agg.grossRevenuePaise - agg.refundedPaise,
      currency: 'INR',
    };
  }

  // ── internals ───────────────────────────────────────────────────────

  private async transition(orderId: string, from: OrderStatus, to: OrderStatus): Promise<void> {
    assertTransition(from, to);
    await this.repo.update(orderId, { status: to });
  }

  private async requireOrder(orderId: string): Promise<NonNullable<OrderRow>> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async loadOwned(actor: AuthPrincipal, orderId: string): Promise<NonNullable<OrderRow>> {
    const order = await this.requireOrder(orderId);
    const customerProfileId = await this.customerProfileId(actor);
    if (order.customerProfileId !== customerProfileId) {
      throw new ForbiddenException('This order does not belong to you.');
    }
    return order;
  }

  private assertEditable(status: OrderStatus): void {
    const editable: OrderStatus[] = [
      ORDER_STATUSES.UPLOADED,
      ORDER_STATUSES.VALIDATED,
      ORDER_STATUSES.MACHINE_READY,
      ORDER_STATUSES.PAYMENT_PENDING,
    ];
    if (!editable.includes(status)) {
      throw new ConflictException(`Order can no longer be edited (status ${status}).`);
    }
  }

  private async customerProfileId(actor: AuthPrincipal): Promise<string> {
    const existing = await this.prisma.client.customerProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.client.customerProfile.create({
      data: { userId: actor.userId },
      select: { id: true },
    });
    return created.id;
  }

  private async operatorProfileId(actor: AuthPrincipal): Promise<string | null> {
    const profile = await this.prisma.client.operatorProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  /** Operators see only orders on their machines; admins see the whole fleet. */
  private async scopeWhere(actor: AuthPrincipal): Promise<Prisma.OrderWhereInput> {
    if (actor.role !== ROLES.OPERATOR) return {};
    const opId = (await this.operatorProfileId(actor)) ?? '__none__';
    return { machine: { operatorProfileId: opId } };
  }

  private async assertScope(actor: AuthPrincipal, machineId: string): Promise<void> {
    if (actor.role !== ROLES.OPERATOR) return;
    const opId = await this.operatorProfileId(actor);
    const machine = await this.prisma.client.machine.findUnique({
      where: { id: machineId },
      select: { operatorProfileId: true },
    });
    if (machine?.operatorProfileId !== opId) {
      throw new ForbiddenException('Order not on a machine assigned to you.');
    }
  }

  private async recordTransition(
    orderId: string,
    action: Parameters<AuditService['record']>[0]['action'],
    actorUserId: string,
    req: Request,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const device = getDeviceInfo(req);
    await this.audit.record({
      action,
      actorUserId,
      targetType: 'Order',
      targetId: orderId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: metadata ?? null,
    });
  }

  private newOrderNumber(): string {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `PK-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private toResponse(order: OrderRow): OrderResponse {
    if (!order) throw new NotFoundException('Order not found');
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      amountPaise: order.amountPaise,
      currency: order.currency,
      uploadId: order.uploadId,
      machineId: order.machineId,
      printOption: order.printOption
        ? {
            copies: order.printOption.copies,
            colorMode: order.printOption.colorMode,
            duplex: order.printOption.duplex,
            paperSize: order.printOption.paperSize,
            orientation: order.printOption.orientation,
            pageRange: order.printOption.pageRange,
            pagesToPrint: order.printOption.pagesToPrint,
          }
        : null,
      paymentStatus: order.payment?.status ?? null,
      pinStatus: order.pin?.status ?? null,
      pinExpiresAt: order.pin?.expiresAt?.toISOString() ?? null,
      failureReason: order.failureReason,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toListItem(order: NonNullable<OrderRow>): OrderListItem {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      amountPaise: order.amountPaise,
      currency: order.currency,
      machineId: order.machineId,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
