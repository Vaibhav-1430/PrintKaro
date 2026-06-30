import { PAYMENT_RESULTS } from '@print-karo/types';
import { PaymentSimulator } from './payment-simulator.provider';

describe('PaymentSimulator', () => {
  const sim = new PaymentSimulator();

  it('is named "simulator"', () => {
    expect(sim.name).toBe('simulator');
  });

  it('creates a provider order with a sim_ id', async () => {
    const order = await sim.createOrder(5000, 'INR', 'PK-1');
    expect(order.providerOrderId).toMatch(/^sim_order_/);
  });

  it('charges SUCCESS by default with a payment id', async () => {
    const res = await sim.charge('sim_order_x', 5000);
    expect(res.result).toBe(PAYMENT_RESULTS.SUCCESS);
    expect(res.providerPaymentId).toMatch(/^sim_pay_/);
  });

  it.each([PAYMENT_RESULTS.FAILURE, PAYMENT_RESULTS.TIMEOUT, PAYMENT_RESULTS.CANCELLED])(
    'returns %s with no payment id when requested',
    async (outcome) => {
      const res = await sim.charge('sim_order_x', 5000, outcome);
      expect(res.result).toBe(outcome);
      expect(res.providerPaymentId).toBeNull();
    },
  );

  it('echoes the requested outcome and amount in raw', async () => {
    const res = await sim.charge('sim_order_y', 1234, PAYMENT_RESULTS.SUCCESS);
    expect(res.raw).toMatchObject({ amountPaise: 1234, simulated: true });
  });

  it('refunds with a sim_refund_ ref', async () => {
    const res = await sim.refund('sim_pay_z', 5000);
    expect(res.providerRef).toMatch(/^sim_refund_/);
  });

  it('generates unique ids per call', async () => {
    const a = await sim.createOrder(1, 'INR', 'r');
    const b = await sim.createOrder(1, 'INR', 'r');
    expect(a.providerOrderId).not.toBe(b.providerOrderId);
  });
});
