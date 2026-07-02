import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { Auth } from '@print-karo/auth';
import {
  AUDIT_ACTIONS,
  type AuthUser,
  type SessionInfo,
  type UpdateProfileInput,
} from '@print-karo/types';
import { AUTH_INSTANCE } from './auth.tokens';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../rbac/auth-context';
import { getDeviceInfo } from '../common/device-info';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Current user profile (+ customer profile fields if present). */
  async me(principal: AuthPrincipal): Promise<AuthUser & { phone?: string | null }> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: principal.userId, deletedAt: null },
      include: { customerProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneNumberVerified: user.phoneNumberVerified,
      status: user.status,
      phone: user.customerProfile?.phone ?? user.phoneNumber ?? null,
    };
  }

  /** Update display name + customer profile fields. */
  async updateProfile(
    principal: AuthPrincipal,
    input: UpdateProfileInput,
    req: Request,
  ): Promise<AuthUser> {
    const user = await this.prisma.client.user.update({
      where: { id: principal.userId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.phone || input.defaultCity
          ? {
              customerProfile: {
                upsert: {
                  create: { phone: input.phone, defaultCity: input.defaultCity },
                  update: { phone: input.phone, defaultCity: input.defaultCity },
                },
              },
            }
          : {}),
      },
    });

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.PROFILE_UPDATED,
      actorUserId: principal.userId,
      targetType: 'User',
      targetId: principal.userId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneNumberVerified: user.phoneNumberVerified,
      status: user.status,
    };
  }

  /** List the user's non-revoked sessions, flagging the current one. */
  async listSessions(principal: AuthPrincipal): Promise<SessionInfo[]> {
    const sessions = await this.prisma.client.session.findMany({
      where: { userId: principal.userId, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      current: s.id === principal.sessionId,
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      ipAddress: s.ipAddress,
      country: s.country,
      lastActivityAt: s.lastActivityAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));
  }

  /** Revoke a single session belonging to the user. */
  async revokeSession(principal: AuthPrincipal, sessionId: string, req: Request): Promise<void> {
    const session = await this.prisma.client.session.findFirst({
      where: { id: sessionId, userId: principal.userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.client.session.update({
      where: { id: sessionId },
      data: { revoked: true, revokedAt: new Date() },
    });

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      actorUserId: principal.userId,
      targetType: 'Session',
      targetId: sessionId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }

  /** Revoke every session for the user (logout all devices). */
  async logoutAll(principal: AuthPrincipal, req: Request): Promise<{ revoked: number }> {
    const result = await this.prisma.client.session.updateMany({
      where: { userId: principal.userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.USER_LOGOUT_ALL,
      actorUserId: principal.userId,
      targetType: 'User',
      targetId: principal.userId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { count: result.count },
    });

    return { revoked: result.count };
  }
}
