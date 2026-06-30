import { ConflictException, ForbiddenException } from '@nestjs/common';
import { HEALTH_GATE_RESULTS, ORDER_STATUSES } from '@print-karo/types';
import { OrderService } from './order.service';
import type { OrderRepository } from './order.repository';
import type { OrderQueueService } from './order-queue.service';
import type { PricingService } from '../pricing/pricing.service';
import type { PinService } from '../pin/pin.service';
import type { NotificationService } from '../notification/notification.service';
import type { MachineHeartbeatService } from '../machine/machine-heartbeat.service';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthPrincipal } from '../rbac/auth-context';

const actor: AuthPrincipal = {
  type: 'USER',
  userId: 'u1',
  email: 'c@x.com',
  role: 'CUSTOMER',
  emailVerified: true,
  status: 'ACTIVE',
  permissions: [],
  sessionId: 's1',
};

const req = { headers: {}, ip: '127.0.0.1', socket: {} } as never;

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderNumber: 'PK-1',
    status: ORDER_STATUSES.VALIDATED,
    amountPaise: 200,
    currency: 'INR',
    uploadId: 'up1',
    machineId: 'm1',
    customerProfileId: 'cp1',
    userId: 'u1',
    printOption: {
      copies: 1,
      colorMode: 'BW',
      duplex: false,
      paperSize: 'A4',
      orientation: 'portrait',
      pageRange: null,
      pagesToPrint: 1,
    },
    payment: null,
    pin: null,
    failureReason: null,
    expiresAt: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function make() {
  const repo = {
    findById: jest.fn().mockResolvedValue(orderRow()),
    update: jest.fn().mockResolvedValue(orderRow()),
    create: jest.fn(),
    upsertPrintOption: jest.fn(),
    listForCustomer: jest.fn(),
    listAll: jest.fn(),
    revenue: jest.fn(),
  } as unknown as OrderRepository;
  const queue = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  } as unknown as OrderQueueService;
  const pricing = { calculate: jest.fn() } as unknown as PricingService;
  const pins = {
    mint: jest.fn().mockResolvedValue({
      pin: '1234',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    expire: jest.fn().mockResolvedValue(undefined),
  } as unknown as PinService;
  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;
  const health = { getHealth: jest.fn() } as unknown as MachineHeartbeatService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const prisma = {
    client: {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp1' }),
        create: jest.fn(),
      },
      operatorProfile: { findUnique: jest.fn() },
      machine: { findUnique: jest.fn() },
    },
  } as unknown as PrismaService;
  const svc = new OrderService(repo, queue, pricing, pins, notifications, health, audit, prisma);
  return { svc, repo, queue, pricing, pins, notifications, health };
}

describe('OrderService.verifyMachine (health gate)', () => {
  it('blocks payment when the machine gate is BLOCKED', async () => {
    const { svc, health } = make();
    (health.getHealth as jest.Mock).mockResolvedValue({
      gateResult: HEALTH_GATE_RESULTS.BLOCKED,
      blockingReasons: ['OUT_OF_PAPER'],
    });
    await expect(svc.verifyMachine(actor, 'o1', req)).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks payment when there is no health snapshot', async () => {
    const { svc, health } = make();
    (health.getHealth as jest.Mock).mockResolvedValue(null);
    await expect(svc.verifyMachine(actor, 'o1', req)).rejects.toBeInstanceOf(ConflictException);
  });

  it('advances to PAYMENT_PENDING when the gate is READY', async () => {
    const { svc, repo, health } = make();
    (health.getHealth as jest.Mock).mockResolvedValue({
      gateResult: HEALTH_GATE_RESULTS.READY,
      blockingReasons: [],
    });
    await svc.verifyMachine(actor, 'o1', req);
    expect(repo.update).toHaveBeenCalledWith('o1', { status: ORDER_STATUSES.MACHINE_READY });
    expect(repo.update).toHaveBeenCalledWith('o1', { status: ORDER_STATUSES.PAYMENT_PENDING });
  });

  it('allows WARNING through the gate', async () => {
    const { svc, health } = make();
    (health.getHealth as jest.Mock).mockResolvedValue({
      gateResult: HEALTH_GATE_RESULTS.WARNING,
      blockingReasons: [],
    });
    await expect(svc.verifyMachine(actor, 'o1', req)).resolves.toBeDefined();
  });
});

describe('OrderService.markPaid', () => {
  it('mints a PIN, dispatches the job and notifies', async () => {
    const { svc, repo, pins, queue, notifications } = make();
    (repo.findById as jest.Mock).mockResolvedValue(
      orderRow({ status: ORDER_STATUSES.PAYMENT_PENDING }),
    );
    await svc.markPaid('o1');
    expect(repo.update).toHaveBeenCalledWith('o1', { status: ORDER_STATUSES.PAID });
    expect(pins.mint).toHaveBeenCalledWith('o1', 'm1');
    expect(repo.update).toHaveBeenCalledWith('o1', { status: ORDER_STATUSES.PIN_GENERATED });
    expect(queue.dispatch).toHaveBeenCalledWith('o1', 'm1');
    expect(notifications.notify).toHaveBeenCalled();
  });
});

describe('OrderService.markCompleted / markFailed', () => {
  it('completes and expires the PIN', async () => {
    const { svc, repo, pins } = make();
    (repo.findById as jest.Mock).mockResolvedValue(orderRow({ status: ORDER_STATUSES.PRINTING }));
    await svc.markCompleted('o1');
    expect(repo.update).toHaveBeenCalledWith('o1', { status: ORDER_STATUSES.COMPLETED });
    expect(pins.expire).toHaveBeenCalledWith('o1');
  });

  it('fails with a reason', async () => {
    const { svc, repo } = make();
    (repo.findById as jest.Mock).mockResolvedValue(orderRow({ status: ORDER_STATUSES.PRINTING }));
    await svc.markFailed('o1', 'paper jam');
    expect(repo.update).toHaveBeenCalledWith('o1', { status: ORDER_STATUSES.FAILED });
    expect(repo.update).toHaveBeenCalledWith('o1', { failureReason: 'paper jam' });
  });
});

describe('OrderService ownership', () => {
  it('forbids accessing an order that belongs to another customer', async () => {
    const { svc, repo } = make();
    (repo.findById as jest.Mock).mockResolvedValue(orderRow({ customerProfileId: 'someone-else' }));
    await expect(svc.getOrder(actor, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
