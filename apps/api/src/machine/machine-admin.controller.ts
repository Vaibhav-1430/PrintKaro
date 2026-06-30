import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  PERMISSIONS,
  registerMachineSchema,
  suspendMachineSchema,
  type RegisterMachineInput,
  type SuspendMachineInput,
} from '@print-karo/types';
import { MachineRegistrationService } from './machine-registration.service';
import { MachineManagementService } from './machine-management.service';
import { Admin, Authenticated } from '../rbac/role-decorators';
import { CurrentUser } from '../rbac/decorators';
import { ZodBody } from '../common/zod-body.decorator';
import type { AuthPrincipal } from '../rbac/auth-context';

/**
 * Admin/operator machine management. RBAC:
 *   - register/suspend/reactivate: ADMIN + SUPER_ADMIN (machine:register/suspend)
 *   - list/detail/logs: anyone with a machine:view permission (operators scoped
 *     to their own machines inside the service)
 *   - restart: operators (assigned) + admins (machine:restart)
 */
@Controller('admin/machines')
export class MachineAdminController {
  constructor(
    private readonly registration: MachineRegistrationService,
    private readonly management: MachineManagementService,
  ) {}

  @Post()
  @Admin(PERMISSIONS.MACHINE_REGISTER)
  register(
    @CurrentUser() actor: AuthPrincipal,
    @ZodBody(registerMachineSchema) body: RegisterMachineInput,
    @Req() req: Request,
  ) {
    return this.registration.register(actor, body, req);
  }

  @Get()
  @Authenticated(PERMISSIONS.MACHINE_VIEW_ASSIGNED)
  list(
    @CurrentUser() actor: AuthPrincipal,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.management.list(actor, limit ? Number(limit) : undefined, cursor);
  }

  @Get(':id')
  @Authenticated(PERMISSIONS.MACHINE_VIEW_ASSIGNED)
  detail(@CurrentUser() actor: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.management.detail(actor, id);
  }

  @Get(':id/logs')
  @Admin(PERMISSIONS.MACHINE_LOGS_VIEW)
  logs(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.management.logs_(actor, id, limit ? Number(limit) : undefined, cursor);
  }

  @Post(':id/suspend')
  @Admin(PERMISSIONS.MACHINE_SUSPEND)
  suspend(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(suspendMachineSchema) body: SuspendMachineInput,
    @Req() req: Request,
  ) {
    return this.management.suspend(actor, id, body.reason, req);
  }

  @Post(':id/reactivate')
  @Admin(PERMISSIONS.MACHINE_SUSPEND)
  reactivate(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.management.reactivate(actor, id, req);
  }

  @Post(':id/restart')
  @Authenticated(PERMISSIONS.MACHINE_RESTART)
  restart(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.management.requestRestart(actor, id, req);
  }
}
