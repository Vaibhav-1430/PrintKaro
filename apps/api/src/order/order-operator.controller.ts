import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '@print-karo/types';
import { OrderService } from './order.service';
import { Operator } from '../rbac/role-decorators';
import { CurrentUser } from '../rbac/decorators';
import type { AuthPrincipal } from '../rbac/auth-context';

/** Operator order/revenue views — scoped to the operator's assigned machines. */
@Controller('operator')
export class OrderOperatorController {
  constructor(private readonly orders: OrderService) {}

  @Get('orders')
  @Operator(PERMISSIONS.ORDER_VIEW_ASSIGNED)
  listOrders(@CurrentUser() user: AuthPrincipal) {
    return this.orders.listAll(user);
  }

  @Get('revenue')
  @Operator(PERMISSIONS.OPERATOR_REVENUE_VIEW)
  revenue(@CurrentUser() user: AuthPrincipal) {
    return this.orders.revenue(user);
  }
}
