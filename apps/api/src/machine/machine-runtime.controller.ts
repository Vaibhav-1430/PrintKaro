import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  heartbeatSchema,
  jobAcceptSchema,
  jobRejectSchema,
  machineLogBatchSchema,
  redeemPinSchema,
  reportPrintResultSchema,
  type HeartbeatInput,
  type JobAcceptInput,
  type JobRejectInput,
  type MachineLogBatchInput,
  type RedeemPinInput,
  type ReportPrintResultInput,
} from '@print-karo/types';
import { MachineService } from './machine.service';
import { MachineHeartbeatService } from './machine-heartbeat.service';
import { MachineQueueService } from './machine-queue.service';
import { MachineLogsService } from './machine-logs.service';
import { MachineConfigService } from './machine-config.service';
import { MachineOnly } from '../rbac/role-decorators';
import { CurrentMachine } from '../rbac/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { MachinePrincipal } from '../rbac/auth-context';

/**
 * Authenticated MACHINE runtime endpoints. Every route requires a valid
 * machine JWT (Bearer) and is scoped to the calling machine via @CurrentMachine.
 * A Windows PC and a Raspberry Pi hit these identically — the backend never
 * knows which hardware is connected.
 */
@MachineOnly()
@Controller('machine')
export class MachineRuntimeController {
  constructor(
    private readonly machineService: MachineService,
    private readonly heartbeat: MachineHeartbeatService,
    private readonly queue: MachineQueueService,
    private readonly logs: MachineLogsService,
    private readonly config: MachineConfigService,
  ) {}

  @Post('heartbeat')
  ingestHeartbeat(
    @CurrentMachine() machine: MachinePrincipal,
    @Body(new ZodValidationPipe(heartbeatSchema)) body: HeartbeatInput,
  ) {
    return this.heartbeat.ingest(machine.machineId, body);
  }

  @Get('status')
  status(@CurrentMachine() machine: MachinePrincipal) {
    return this.heartbeat.getHealth(machine.machineId);
  }

  @Get('config')
  getConfig(@CurrentMachine() machine: MachinePrincipal) {
    return this.config.getConfig(machine.machineId);
  }

  @Get('jobs')
  jobs(@CurrentMachine() machine: MachinePrincipal) {
    return this.queue.poll(machine.machineId);
  }

  @Post('job/accept')
  acceptJob(
    @CurrentMachine() machine: MachinePrincipal,
    @Body(new ZodValidationPipe(jobAcceptSchema)) body: JobAcceptInput,
  ) {
    return this.queue.acceptJob(machine.machineId, body.jobId);
  }

  @Post('job/reject')
  rejectJob(
    @CurrentMachine() machine: MachinePrincipal,
    @Body(new ZodValidationPipe(jobRejectSchema)) body: JobRejectInput,
  ) {
    return this.queue.rejectJob(machine.machineId, body.jobId, body.reason);
  }

  @Post('pin/redeem')
  redeemPin(
    @CurrentMachine() machine: MachinePrincipal,
    @Body(new ZodValidationPipe(redeemPinSchema)) body: RedeemPinInput,
  ) {
    return this.queue.redeemPin(machine.machineId, body.pin);
  }

  @Post('job/report')
  reportResult(
    @CurrentMachine() machine: MachinePrincipal,
    @Body(new ZodValidationPipe(reportPrintResultSchema)) body: ReportPrintResultInput,
  ) {
    return this.queue.reportResult(machine.machineId, body);
  }

  @Post('log')
  uploadLogs(
    @CurrentMachine() machine: MachinePrincipal,
    @Body(new ZodValidationPipe(machineLogBatchSchema)) body: MachineLogBatchInput,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.logs.ingestBatch(machine.machineId, body, req.correlationId);
  }

  @Post('logout')
  logout(@CurrentMachine() machine: MachinePrincipal, @Req() req: Request) {
    return this.machineService.logout(machine.machineId, req);
  }
}
