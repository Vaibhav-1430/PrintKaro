import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PERMISSIONS } from '@print-karo/types';
import { OrderService } from './order.service';
import { PinService } from '../pin/pin.service';
import { Admin } from '../rbac/role-decorators';
import { CurrentUser } from '../rbac/decorators';
import type { AuthPrincipal } from '../rbac/auth-context';

/** Admin order/revenue/PIN dashboards (admins see the whole fleet). */
@Controller('admin')
export class OrderAdminController {
  constructor(
    private readonly orders: OrderService,
    private readonly pins: PinService,
  ) {}

  @Get('orders')
  @Admin(PERMISSIONS.ORDER_VIEW_ALL)
  listOrders(@CurrentUser() user: AuthPrincipal) {
    return this.orders.listAll(user);
  }

  @Get('orders/:id')
  @Admin(PERMISSIONS.ORDER_VIEW_ALL)
  getOrder(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.adminGet(user, id);
  }

  @Get('revenue')
  @Admin(PERMISSIONS.REVENUE_VIEW_ALL)
  revenue(@CurrentUser() user: AuthPrincipal) {
    return this.orders.revenue(user);
  }

  @Get('pins/active')
  @Admin(PERMISSIONS.PIN_VIEW)
  activePins() {
    return this.pins.listActive();
  }
}
