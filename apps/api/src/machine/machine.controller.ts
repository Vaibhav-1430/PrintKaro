import { Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  machineLoginSchema,
  machineRefreshSchema,
  type MachineLoginInput,
  type MachineRefreshInput,
} from '@print-karo/types';
import { MachineService } from './machine.service';
import { MachineManagementService } from './machine-management.service';
import { Public } from '../rbac/decorators';
import { ZodBody } from '../common/zod-body.decorator';

/**
 * Machine authentication endpoints. Machines authenticate via id+secret and
 * receive a JWT pair; they never use the UI. These are @Public because they
 * establish the machine principal themselves (no prior session).
 */
@Controller('machine')
export class MachineController {
  constructor(
    private readonly machineService: MachineService,
    private readonly management: MachineManagementService,
  ) {}

  @Post('login')
  @Public()
  login(@ZodBody(machineLoginSchema) body: MachineLoginInput, @Req() req: Request) {
    return this.machineService.login(body.machineId, body.machineSecret, req);
  }

  @Post('refresh')
  @Public()
  refresh(@ZodBody(machineRefreshSchema) body: MachineRefreshInput, @Req() req: Request) {
    return this.machineService.refresh(body.refreshToken, req);
  }

  /**
   * Public machine directory: name, location and live availability only.
   * Powers the landing page and the pre-auth machine picker in the customer
   * flow (customers pick a machine before they have an account).
   */
  @Get('directory')
  @Public()
  directory() {
    return this.management.publicDirectory();
  }
}
