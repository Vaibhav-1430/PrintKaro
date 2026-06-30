import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PERMISSIONS, createAdminSchema, type CreateAdminInput } from '@print-karo/types';
import { UsersService } from './users.service';
import { CurrentUser } from '../rbac/decorators';
import { SuperAdmin } from '../rbac/role-decorators';
import { ZodBody } from '../common/zod-body.decorator';
import type { AuthPrincipal } from '../rbac/auth-context';

/** Admin creation — SUPER_ADMIN only (an admin cannot create another admin). */
@Controller('admin')
export class AdminController {
  constructor(private readonly users: UsersService) {}

  @Post('create')
  @SuperAdmin(PERMISSIONS.ADMIN_CREATE)
  createAdmin(
    @CurrentUser() actor: AuthPrincipal,
    @ZodBody(createAdminSchema) body: CreateAdminInput,
    @Req() req: Request,
  ) {
    return this.users.createAdmin(actor, body, req);
  }
}
