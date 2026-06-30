import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { AUDIT_ACTIONS, type MachineTokens } from '@print-karo/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MachineTokenService } from './machine-token.service';
import { getDeviceInfo } from '../common/device-info';

@Injectable()
export class MachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: MachineTokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get pepper(): string {
    return this.config.get<string>('MACHINE_SECRET_PEPPER', '');
  }

  /**
   * Authenticate a machine by id + secret and issue a JWT pair.
   * Constant-time-ish: always runs an argon2 verify against a stored or dummy
   * hash so timing doesn't reveal whether the machine exists.
   */
  async login(machineId: string, machineSecret: string, req: Request): Promise<MachineTokens> {
    const device = getDeviceInfo(req);

    const machine = await this.prisma.client.machine.findFirst({
      where: { id: machineId, deletedAt: null },
      include: { credential: true },
    });

    const hash = machine?.credential?.secretHash;
    const ok = hash
      ? await argon2.verify(hash, machineSecret + this.pepper)
      : await argon2
          .verify(
            '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
            'dummy',
          )
          .catch(() => false);

    if (!machine || !ok || machine.status !== 'ACTIVE') {
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        actorType: 'MACHINE',
        actorMachineId: machineId,
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
        metadata: { reason: 'machine_login_failed' },
      });
      throw new UnauthorizedException('Invalid machine credentials');
    }

    const tokens = await this.tokens.issueTokens(
      { id: machine.id, code: machine.code },
      { ipAddress: device.ipAddress ?? undefined, userAgent: device.userAgent ?? undefined },
    );

    await this.prisma.client.machine.update({
      where: { id: machine.id },
      data: { lastAuthAt: new Date() },
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.MACHINE_LOGIN,
      actorType: 'MACHINE',
      actorMachineId: machine.id,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });

    return tokens;
  }

  /** Rotate a machine refresh token (single-use + revocation on reuse). */
  async refresh(refreshToken: string, req: Request): Promise<MachineTokens> {
    const device = getDeviceInfo(req);
    const { tokens, machineId } = await this.tokens.rotateRefreshToken(refreshToken, {
      ipAddress: device.ipAddress ?? undefined,
      userAgent: device.userAgent ?? undefined,
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.MACHINE_TOKEN_REFRESHED,
      actorType: 'MACHINE',
      actorMachineId: machineId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
    return tokens;
  }

  /** Revoke all refresh tokens for a machine (logout / decommission). */
  async logout(machineId: string, req: Request): Promise<{ loggedOut: true }> {
    const device = getDeviceInfo(req);
    await this.tokens.revokeAll(machineId);
    await this.audit.record({
      action: AUDIT_ACTIONS.MACHINE_LOGOUT,
      actorType: 'MACHINE',
      actorMachineId: machineId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
    return { loggedOut: true };
  }
}
