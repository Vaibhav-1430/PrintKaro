import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_RESULTS, PAYMENT_STATUSES } from '@print-karo/types';
import { PaymentService } from './payment.service';
import type { PaymentRepository } from './payment.repository';
import type { PaymentProvider } from './payment.provider';
import type { OrderService } from '../order/order.service';
import type { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../rbac/auth-context';

const actor = { userId: 'u1', role: 'CUSTOMER' } as AuthPrincipal;
const req = { headers: {}, ip: '1.1.1.1', socket: {} } as never;

function make() {
  const repo = {
    findByOrderId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'pay-1', orderId: 'o1', amountPaise: 200 }),
    update: jest.fn().mockImplementation((id, data) =>
      Promise.resolve({
        id,
        orderId: 'o1',
        provider: 'simulator',
        amountPaise: 200,
        currency: 'INR',
        providerOrderId: 'po',
        providerPaymentId: null,
        failureReason: null,
        status: data.status ?? 'PENDING',
        createdAt: new Date(),
      }),
    ),
    addTransaction: jest.fn().mockResolvedValue({}),
  } as unknown as PaymentRepository;
  const provider = {
    name: 'simulator',
    createOrder: jest.fn().mockResolvedValue({ providerOrderId: 'po' }),
    charge: jest.fn(),
    refund: jest.fn().mockResolvedValue({ providerRef: 'ref', raw: {} }),
  } as unknown as PaymentProvider;
  const orders = {
    loadOwnedForPayment: jest
      .fn()
      .mockResolvedValue({ id: 'o1', orderNumber: 'PK-1', amountPaise: 200, currency: 'INR' }),
    markPaymentPending: jest.fn().mockResolvedValue(undefined),
    markPaid: jest.fn().mockResolvedValue(undefined),
    markPaymentFailed: jest.fn().mockResolvedValue(undefined),
    markRefunded: jest.fn().mockResolvedValue(undefined),
  } as unknown as OrderService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const config = { get: (_k: string, d: unknown) => d } as unknown as ConfigService;
  const svc = new PaymentService(repo, provider, orders, audit, config);
  return { svc, repo, provider, orders };
}

describe('PaymentService.initiate', () => {
  it('creates the provider order and sets the payment PROCESSING', async () => {
    const { svc, repo, orders } = make();
    (repo.findByOrderId as jest.Mock).mockResolvedValue(null);
    const res = await svc.initiate(actor, 'o1', req);
    expect(res.status).toBe(PAYMENT_STATUSES.PROCESSING);
    expect(orders.markPaymentPending).toHaveBeenCalledWith('o1');
  });

  it('rejects if already paid', async () => {
    const { svc, repo } = make();
    (repo.findByOrderId as jest.Mock).mockResolvedValue({
      id: 'pay-1',
      status: PAYMENT_STATUSES.SUCCEEDED,
    });
    await expect(svc.initiate(actor, 'o1', req)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PaymentService.simulate', () => {
  it('marks the order PAID on a SUCCESS charge', async () => {
    const { svc, repo, provider, orders } = make();
    (repo.findByOrderId as jest.Mock).mockResolvedValue({
      id: 'pay-1',
      providerOrderId: 'po',
      amountPaise: 200,
      status: 'PROCESSING',
    });
    (provider.charge as jest.Mock).mockResolvedValue({
      result: PAYMENT_RESULTS.SUCCESS,
      providerPaymentId: 'pp',
      raw: {},
    });
    const res = await svc.simulate(actor, 'o1', PAYMENT_RESULTS.SUCCESS, req);
    expect(res.status).toBe(PAYMENT_STATUSES.SUCCEEDED);
    expect(orders.markPaid).toHaveBeenCalledWith('o1');
  });

  it.each([PAYMENT_RESULTS.FAILURE, PAYMENT_RESULTS.TIMEOUT])(
    'fails the payment and keeps the order payable on %s',
    async (outcome) => {
      const { svc, repo, provider, orders } = make();
      (repo.findByOrderId as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerOrderId: 'po',
        amountPaise: 200,
        status: 'PROCESSING',
      });
      (provider.charge as jest.Mock).mockResolvedValue({
        result: outcome,
        providerPaymentId: null,
        raw: {},
      });
      const res = await svc.simulate(actor, 'o1', outcome, req);
      expect(res.status).toBe(PAYMENT_STATUSES.FAILED);
      expect(orders.markPaymentFailed).toHaveBeenCalled();
      expect(orders.markPaid).not.toHaveBeenCalled();
    },
  );

  it('marks CANCELLED on a cancelled charge', async () => {
    const { svc, repo, provider } = make();
    (repo.findByOrderId as jest.Mock).mockResolvedValue({
      id: 'pay-1',
      providerOrderId: 'po',
      amountPaise: 200,
      status: 'PROCESSING',
    });
    (provider.charge as jest.Mock).mockResolvedValue({
      result: PAYMENT_RESULTS.CANCELLED,
      providerPaymentId: null,
      raw: {},
    });
    const res = await svc.simulate(actor, 'o1', PAYMENT_RESULTS.CANCELLED, req);
    expect(res.status).toBe(PAYMENT_STATUSES.CANCELLED);
  });
});

describe('PaymentService.refund', () => {
  it('refunds a succeeded payment and reverses the order', async () => {
    const { svc, repo, provider, orders } = make();
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'pay-1',
      orderId: 'o1',
      amountPaise: 200,
      status: PAYMENT_STATUSES.SUCCEEDED,
      providerPaymentId: 'pp',
    });
    const res = await svc.refund(actor, 'pay-1', 'duplicate', req);
    expect(provider.refund).toHaveBeenCalledWith('pp', 200);
    expect(res.status).toBe(PAYMENT_STATUSES.REFUNDED);
    expect(orders.markRefunded).toHaveBeenCalledWith('o1', 'duplicate');
  });

  it('refuses to refund a non-succeeded payment', async () => {
    const { svc, repo } = make();
    (repo.findById as jest.Mock).mockResolvedValue({
      id: 'pay-1',
      status: PAYMENT_STATUSES.PENDING,
    });
    await expect(svc.refund(actor, 'pay-1', undefined, req)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
