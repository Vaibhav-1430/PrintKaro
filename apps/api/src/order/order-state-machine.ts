import { ConflictException } from '@nestjs/common';
import { canTransition, type OrderStatus } from '@print-karo/types';

/**
 * Thin guard over the pure ORDER_TRANSITIONS map (defined in @print-karo/types).
 * Centralizes the "is this transition legal?" decision so the OrderService never
 * mutates status without passing through here. Throws a 409 on an illegal move.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(`Illegal order transition: ${from} -> ${to}`);
  }
}
