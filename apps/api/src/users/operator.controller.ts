import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PERMISSIONS, createOperatorSchema, type CreateOperatorInput } from '@print-karo/types';
import { UsersService } from './users.service';
import { CurrentUser } from '../rbac/decorators';
import { Admin } from '../rbac/role-decorators';
import { ZodBody } from '../common/zod-body.decorator';
import type { AuthPrincipal } from '../rbac/auth-context';

/** Operator creation — ADMIN or SUPER_ADMIN. */
@Controller('operator')
export class OperatorController {
  constructor(private readonly users: UsersService) {}

  @Post('create')
  @Admin(PERMISSIONS.OPERATOR_CREATE)
  createOperator(
    @CurrentUser() actor: AuthPrincipal,
    @ZodBody(createOperatorSchema) body: CreateOperatorInput,
    @Req() req: Request,
  ) {
    return this.users.createOperator(actor, body, req);
  }
}
