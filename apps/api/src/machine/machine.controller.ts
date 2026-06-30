import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  machineLoginSchema,
  machineRefreshSchema,
  type MachineLoginInput,
  type MachineRefreshInput,
} from '@print-karo/types';
import { MachineService } from './machine.service';
import { Public } from '../rbac/decorators';
import { ZodBody } from '../common/zod-body.decorator';

/**
 * Machine authentication endpoints. Machines authenticate via id+secret and
 * receive a JWT pair; they never use the UI. These are @Public because they
 * establish the machine principal themselves (no prior session).
 */
@Controller('machine')
export class MachineController {
  constructor(private readonly machineService: MachineService) {}

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
}
