import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  PERMISSIONS,
  createOrderSchema,
  printOptionSchema,
  type CreateOrderInput,
  type PrintOptionInput,
} from '@print-karo/types';
import { OrderService } from './order.service';
import { Customer } from '../rbac/role-decorators';
import { CurrentUser } from '../rbac/decorators';
import { ZodBody } from '../common/zod-body.decorator';
import type { AuthPrincipal } from '../rbac/auth-context';

/** Customer order endpoints — the upload → options → verify → pay funnel. */
@Controller('orders')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @Customer(PERMISSIONS.ORDER_CREATE)
  create(
    @CurrentUser() user: AuthPrincipal,
    @ZodBody(createOrderSchema) body: CreateOrderInput,
    @Req() req: Request,
  ) {
    return this.orders.createOrder(user, body, req);
  }

  @Post(':id/options')
  @Customer(PERMISSIONS.ORDER_CREATE)
  setOptions(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(printOptionSchema) body: PrintOptionInput,
  ) {
    return this.orders.setOptions(user, id, body);
  }

  @Post(':id/verify-machine')
  @Customer(PERMISSIONS.ORDER_CREATE)
  verifyMachine(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.orders.verifyMachine(user, id, req);
  }

  @Post(':id/cancel')
  @Customer(PERMISSIONS.ORDER_CANCEL)
  cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.orders.cancel(user, id, req);
  }

  @Get()
  @Customer(PERMISSIONS.ORDER_VIEW)
  list(@CurrentUser() user: AuthPrincipal) {
    return this.orders.listMine(user);
  }

  @Get(':id')
  @Customer(PERMISSIONS.ORDER_VIEW)
  get(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getOrder(user, id);
  }
}
