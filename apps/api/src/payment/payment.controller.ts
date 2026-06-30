import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  PERMISSIONS,
  initiatePaymentSchema,
  refundSchema,
  simulatePaymentSchema,
  type InitiatePaymentInput,
  type RefundInput,
  type SimulatePaymentInput,
} from '@print-karo/types';
import { PaymentService } from './payment.service';
import { Admin, Customer } from '../rbac/role-decorators';
import { CurrentUser } from '../rbac/decorators';
import { ZodBody } from '../common/zod-body.decorator';
import type { AuthPrincipal } from '../rbac/auth-context';

@Controller()
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('payments/:orderId/initiate')
  @Customer(PERMISSIONS.ORDER_PAY)
  initiate(
    @CurrentUser() user: AuthPrincipal,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @ZodBody(initiatePaymentSchema) _body: InitiatePaymentInput,
    @Req() req: Request,
  ) {
    return this.payments.initiate(user, orderId, req);
  }

  @Post('payments/:orderId/simulate')
  @Customer(PERMISSIONS.ORDER_PAY)
  simulate(
    @CurrentUser() user: AuthPrincipal,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @ZodBody(simulatePaymentSchema) body: SimulatePaymentInput,
    @Req() req: Request,
  ) {
    return this.payments.simulate(user, orderId, body.outcome, req);
  }

  @Get('payments/:orderId')
  @Customer(PERMISSIONS.ORDER_VIEW)
  get(@CurrentUser() user: AuthPrincipal, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.payments.getForOrder(user, orderId);
  }

  @Post('admin/payments/:id/refund')
  @Admin(PERMISSIONS.REFUND_MANAGE)
  refund(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(refundSchema) body: RefundInput,
    @Req() req: Request,
  ) {
    return this.payments.refund(user, id, body.reason, req);
  }
}
