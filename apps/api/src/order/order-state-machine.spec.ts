import { ConflictException } from '@nestjs/common';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  canTransition,
  isTerminalStatus,
  type OrderStatus,
} from '@print-karo/types';
import { assertTransition } from './order-state-machine';

const ALL = Object.values(ORDER_STATUSES) as OrderStatus[];

describe('order state machine', () => {
  it('every legal transition is accepted by assertTransition', () => {
    for (const from of ALL) {
      for (const to of ORDER_TRANSITIONS[from]) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  it('every illegal transition throws ConflictException', () => {
    for (const from of ALL) {
      const legal = new Set(ORDER_TRANSITIONS[from]);
      for (const to of ALL) {
        if (legal.has(to)) continue;
        expect(() => assertTransition(from, to)).toThrow(ConflictException);
      }
    }
  });

  it('models the full happy path', () => {
    const path: OrderStatus[] = [
      ORDER_STATUSES.DRAFT,
      ORDER_STATUSES.UPLOADED,
      ORDER_STATUSES.VALIDATED,
      ORDER_STATUSES.MACHINE_READY,
      ORDER_STATUSES.PAYMENT_PENDING,
      ORDER_STATUSES.PAID,
      ORDER_STATUSES.PIN_GENERATED,
      ORDER_STATUSES.WAITING_AT_MACHINE,
      ORDER_STATUSES.PRINTING,
      ORDER_STATUSES.COMPLETED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('marks the right terminal states', () => {
    expect(isTerminalStatus(ORDER_STATUSES.COMPLETED)).toBe(true);
    expect(isTerminalStatus(ORDER_STATUSES.REFUNDED)).toBe(true);
    expect(isTerminalStatus(ORDER_STATUSES.CANCELLED)).toBe(true);
    expect(isTerminalStatus(ORDER_STATUSES.DRAFT)).toBe(false);
    expect(isTerminalStatus(ORDER_STATUSES.PAID)).toBe(false);
  });

  it('allows FAILED and EXPIRED to be refunded', () => {
    expect(canTransition(ORDER_STATUSES.FAILED, ORDER_STATUSES.REFUNDED)).toBe(true);
    expect(canTransition(ORDER_STATUSES.EXPIRED, ORDER_STATUSES.REFUNDED)).toBe(true);
  });

  it('forbids resurrecting a completed order', () => {
    for (const to of ALL) {
      expect(canTransition(ORDER_STATUSES.COMPLETED, to)).toBe(false);
    }
  });

  it('allows cancellation only before payment', () => {
    expect(canTransition(ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.CANCELLED)).toBe(true);
    expect(canTransition(ORDER_STATUSES.PAID, ORDER_STATUSES.CANCELLED)).toBe(false);
  });
});
