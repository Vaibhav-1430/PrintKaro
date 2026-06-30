import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Auth } from '@print-karo/auth';
import {
  AUDIT_ACTIONS,
  ROLES,
  type CreateAdminInput,
  type CreateOperatorInput,
} from '@print-karo/types';
import { AUTH_INSTANCE } from '../auth/auth.tokens';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../rbac/auth-context';
import { getDeviceInfo } from '../common/device-info';

@Injectable()
export class UsersService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a staff user through Better Auth (so the credential Account is
   * created with a proper password hash), then elevate their role + profile.
   * Runs inside a guard against duplicate emails.
   */
  private async createStaffUser(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<string> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const result = await this.auth.api.signUpEmail({
      body: { email: input.email, name: input.name, password: input.password },
    });
    if (!result?.user?.id) {
      throw new InternalServerErrorException('Failed to create user');
    }
    return result.user.id;
  }

  /** SUPER_ADMIN creates an ADMIN. */
  async createAdmin(
    actor: AuthPrincipal,
    input: CreateAdminInput,
    req: Request,
  ): Promise<{ id: string; email: string }> {
    const userId = await this.createStaffUser(input);

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        role: ROLES.ADMIN,
        emailVerified: true, // staff are pre-verified by the creating admin
        createdById: actor.userId,
        adminProfile: { create: { isSuperAdmin: false } },
      },
    });

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.ADMIN_CREATED,
      actorUserId: actor.userId,
      targetType: 'User',
      targetId: userId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { email: input.email },
    });

    return { id: userId, email: input.email };
  }

  /** ADMIN or SUPER_ADMIN creates an OPERATOR. */
  async createOperator(
    actor: AuthPrincipal,
    input: CreateOperatorInput,
    req: Request,
  ): Promise<{ id: string; email: string }> {
    const userId = await this.createStaffUser({
      email: input.email,
      name: input.name,
      password: input.password,
    });

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        role: ROLES.OPERATOR,
        emailVerified: true,
        createdById: actor.userId,
        operatorProfile: {
          create: {
            businessName: input.businessName,
            contactPhone: input.contactPhone,
            approved: true,
          },
        },
      },
    });

    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.OPERATOR_CREATED,
      actorUserId: actor.userId,
      targetType: 'User',
      targetId: userId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { email: input.email, businessName: input.businessName },
    });

    return { id: userId, email: input.email };
  }
}
