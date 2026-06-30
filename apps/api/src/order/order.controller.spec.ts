import { OrderController } from './order.controller';
import { OrderAdminController } from './order-admin.controller';
import { OrderOperatorController } from './order-operator.controller';
import type { OrderService } from './order.service';
import type { PinService } from '../pin/pin.service';
import type { AuthPrincipal } from '../rbac/auth-context';

const user = { userId: 'u1' } as AuthPrincipal;
const req = {} as never;

describe('OrderController delegation', () => {
  const orders = {
    createOrder: jest.fn().mockResolvedValue({}),
    setOptions: jest.fn().mockResolvedValue({}),
    verifyMachine: jest.fn().mockResolvedValue({}),
    cancel: jest.fn().mockResolvedValue({}),
    listMine: jest.fn().mockResolvedValue([]),
    getOrder: jest.fn().mockResolvedValue({}),
  } as unknown as OrderService;
  const c = new OrderController(orders);

  it('create → createOrder', () => {
    void c.create(user, { uploadId: 'up', machineId: 'm' }, req);
    expect(orders.createOrder).toHaveBeenCalled();
  });
  it('setOptions → setOptions', () => {
    void c.setOptions(user, 'o1', {
      copies: 1,
      colorMode: 'BW',
      duplex: false,
      paperSize: 'A4',
      orientation: 'portrait',
    });
    expect(orders.setOptions).toHaveBeenCalledWith(user, 'o1', expect.anything());
  });
  it('verifyMachine → verifyMachine', () => {
    void c.verifyMachine(user, 'o1', req);
    expect(orders.verifyMachine).toHaveBeenCalledWith(user, 'o1', req);
  });
  it('cancel/list/get delegate', () => {
    void c.cancel(user, 'o1', req);
    void c.list(user);
    void c.get(user, 'o1');
    expect(orders.cancel).toHaveBeenCalled();
    expect(orders.listMine).toHaveBeenCalled();
    expect(orders.getOrder).toHaveBeenCalled();
  });
});

describe('OrderAdminController delegation', () => {
  const orders = {
    listAll: jest.fn().mockResolvedValue([]),
    adminGet: jest.fn().mockResolvedValue({}),
    revenue: jest.fn().mockResolvedValue({}),
  } as unknown as OrderService;
  const pins = { listActive: jest.fn().mockResolvedValue([]) } as unknown as PinService;
  const c = new OrderAdminController(orders, pins);

  it('delegates each route', () => {
    void c.listOrders(user);
    void c.getOrder(user, 'o1');
    void c.revenue(user);
    void c.activePins();
    expect(orders.listAll).toHaveBeenCalled();
    expect(orders.adminGet).toHaveBeenCalledWith(user, 'o1');
    expect(orders.revenue).toHaveBeenCalled();
    expect(pins.listActive).toHaveBeenCalled();
  });
});

describe('OrderOperatorController delegation', () => {
  const orders = {
    listAll: jest.fn().mockResolvedValue([]),
    revenue: jest.fn().mockResolvedValue({}),
  } as unknown as OrderService;
  const c = new OrderOperatorController(orders);

  it('delegates scoped routes', () => {
    void c.listOrders(user);
    void c.revenue(user);
    expect(orders.listAll).toHaveBeenCalledWith(user);
    expect(orders.revenue).toHaveBeenCalledWith(user);
  });
});
