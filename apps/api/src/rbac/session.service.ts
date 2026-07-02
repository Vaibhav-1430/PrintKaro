import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Auth } from '@print-karo/auth';
import type { Role } from '@print-karo/types';
import { AUTH_INSTANCE } from '../auth/auth.tokens';
import { Inject } from '@nestjs/common';
import type { AuthPrincipal } from './auth-context';
import { PermissionService } from './permission.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bridges a Better Auth session (HttpOnly cookie) into a Nest request principal.
 * Reads the session via Better Auth's server API, then enriches it with the
 * user's DB role/status and DB-resolved permissions.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    private readonly permissions: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(req: Request): Promise<AuthPrincipal | null> {
    const headers = this.toHeaders(req);
    const session = await this.auth.api.getSession({ headers });
    if (!session?.user || !session.session) {
      return null;
    }

    // Authoritative role/status come from our DB, not the cookie payload.
    const dbUser = await this.prisma.client.user.findFirst({
      where: { id: session.user.id, deletedAt: null },
      select: {
        role: true,
        status: true,
        emailVerified: true,
        email: true,
        phoneNumber: true,
        phoneNumberVerified: true,
      },
    });
    if (!dbUser) return null;

    const role = dbUser.role as Role;
    const permissions = await this.permissions.getPermissionsForRole(role);

    return {
      type: 'USER',
      userId: session.user.id,
      email: dbUser.email,
      phoneNumber: dbUser.phoneNumber,
      role,
      emailVerified: dbUser.emailVerified,
      phoneNumberVerified: dbUser.phoneNumberVerified,
      // Customers verify by phone OTP; staff by email. Either confirms identity.
      verified: dbUser.emailVerified || dbUser.phoneNumberVerified,
      status: dbUser.status,
      permissions,
      sessionId: session.session.id,
    };
  }

  private toHeaders(req: Request): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else if (value !== undefined) headers.set(key, value);
    }
    return headers;
  }
}
