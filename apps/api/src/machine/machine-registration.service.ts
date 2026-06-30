import { ConflictException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_ACTIONS,
  type MachineRegistrationResult,
  type RegisterMachineInput,
} from '@print-karo/types';
import { MachineRepository } from './machine.repository';
import { AuditService } from '../audit/audit.service';
import { getDeviceInfo } from '../common/device-info';
import type { AuthPrincipal } from '../rbac/auth-context';

/**
 * Registers a new machine. Generates a one-time plaintext secret (returned
 * once), stores only its Argon2id hash, and provisions the default
 * capabilities + configuration rows in a single transaction.
 */
@Injectable()
export class MachineRegistrationService {
  constructor(
    private readonly repo: MachineRepository,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get pepper(): string {
    return this.config.get<string>('MACHINE_SECRET_PEPPER', '');
  }

  async register(
    actor: AuthPrincipal,
    input: RegisterMachineInput,
    req: Request,
  ): Promise<MachineRegistrationResult> {
    const existing = await this.repo.findByCode(input.code);
    if (existing) {
      throw new ConflictException('A machine with this code already exists');
    }

    // 256-bit URL-safe secret; shown to the admin exactly once.
    const machineSecret = randomBytes(32).toString('base64url');
    const secretHash = await argon2.hash(machineSecret + this.pepper);

    const machine = await this.repo.createMachine({
      code: input.code,
      name: input.name,
      type: input.type,
      status: 'ACTIVE',
      college: input.college,
      building: input.building,
      floor: input.floor,
      room: input.room,
      latitude: input.latitude,
      longitude: input.longitude,
      ...(input.operatorProfileId
        ? { operatorProfile: { connect: { id: input.operatorProfileId } } }
        : {}),
      credential: { create: { secretHash } },
      capabilities: {
        create: {
          colorSupport: input.colorSupport,
          duplexSupport: input.duplexSupport,
          paperSizes: input.paperSizes,
        },
      },
      printer: { create: { printerName: input.printerName } },
      network: { create: {} },
      configuration: { create: {} },
      health: { create: {} },
    });

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.MACHINE_REGISTERED,
      actorUserId: actor.userId,
      targetType: 'Machine',
      targetId: machine.id,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { code: machine.code, type: machine.type },
    });

    return { id: machine.id, code: machine.code, machineSecret };
  }
}
