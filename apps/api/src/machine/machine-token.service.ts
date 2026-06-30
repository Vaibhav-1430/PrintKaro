import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { MachineTokens } from '@print-karo/types';
import { PrismaService } from '../prisma/prisma.service';

interface MachineJwtPayload {
  sub: string; // machineId
  code: string;
  type: 'machine';
}

/**
 * Issues, verifies, rotates and revokes MACHINE JWTs.
 * - Access token: short-lived JWT (stateless verification).
 * - Refresh token: opaque random string, stored HASHED, single-use (rotation).
 */
@Injectable()
export class MachineTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get accessTtl(): number {
    return this.config.get<number>('MACHINE_JWT_ACCESS_TTL', 900);
  }

  private get refreshTtl(): number {
    return this.config.get<number>('MACHINE_JWT_REFRESH_TTL', 2592000);
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Verify an access token and return the machine claims. */
  async verifyAccessToken(token: string): Promise<{ machineId: string; code: string }> {
    let payload: MachineJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<MachineJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired machine token');
    }
    if (payload.type !== 'machine') {
      throw new UnauthorizedException('Invalid machine token');
    }
    // Ensure the machine is still active and not soft-deleted.
    const machine = await this.prisma.client.machine.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, code: true },
    });
    if (!machine) {
      throw new UnauthorizedException('Machine not active');
    }
    return { machineId: machine.id, code: machine.code };
  }

  /** Issue a fresh access + refresh token pair for a machine. */
  async issueTokens(
    machine: { id: string; code: string },
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<MachineTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: machine.id, code: machine.code, type: 'machine' } satisfies MachineJwtPayload,
      { expiresIn: this.accessTtl },
    );

    const rawRefresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtl * 1000);
    await this.prisma.client.refreshToken.create({
      data: {
        machineId: machine.id,
        tokenHash: this.hash(rawRefresh),
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.accessTtl,
      tokenType: 'Bearer',
    };
  }

  /**
   * Rotate a refresh token: validate it, revoke it, and issue a new pair.
   * Reuse of an already-rotated/revoked token is treated as compromise and
   * revokes the whole chain for that machine.
   */
  async rotateRefreshToken(
    rawRefresh: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ tokens: MachineTokens; machineId: string }> {
    const tokenHash = this.hash(rawRefresh);
    const existing = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      include: { machine: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existing.revoked || existing.expiresAt < new Date()) {
      // Possible reuse of a rotated token → revoke all tokens for this machine.
      await this.prisma.client.refreshToken.updateMany({
        where: { machineId: existing.machineId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token no longer valid');
    }
    if (existing.machine.deletedAt || existing.machine.status !== 'ACTIVE') {
      throw new UnauthorizedException('Machine not active');
    }

    const tokens = await this.issueTokens(
      { id: existing.machine.id, code: existing.machine.code },
      context,
    );

    // Revoke the old token and link the rotation chain.
    const replacement = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: this.hash(tokens.refreshToken) },
      select: { id: true },
    });
    await this.prisma.client.refreshToken.update({
      where: { id: existing.id },
      data: { revoked: true, revokedAt: new Date(), replacedById: replacement?.id },
    });

    return { tokens, machineId: existing.machineId };
  }

  /** Revoke every refresh token for a machine (e.g. on decommission). */
  async revokeAll(machineId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { machineId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }
}
