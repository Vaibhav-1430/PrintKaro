import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission, Role } from '@print-karo/types';
import type { AuthedRequest } from './auth-context';
import { ALLOW_UNVERIFIED_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY, ROLES_KEY } from './decorators';
import { SessionService } from './session.service';
import { MachineTokenService } from '../machine/machine-token.service';

/**
 * Global authentication + authorization guard.
 *
 * Resolution order:
 *   1. @Public routes pass through.
 *   2. A `Authorization: Bearer <jwt>` header → MACHINE principal (JWT).
 *   3. Otherwise → USER principal from the Better Auth session cookie.
 *
 * Then enforces (in order): account status, email verification, @Roles, and
 * @RequirePermissions. Authorization is permission-based; roles are an
 * identity filter only.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly machineTokens: MachineTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const bearer = this.extractBearer(req);
    if (bearer) {
      const machine = await this.machineTokens.verifyAccessToken(bearer);
      req.principal = { type: 'MACHINE', machineId: machine.machineId, code: machine.code };
      return this.enforceMachine(context);
    }

    const principal = await this.sessions.resolve(req);
    if (!principal) {
      throw new UnauthorizedException('Authentication required');
    }
    req.principal = principal;

    if (principal.status === 'SUSPENDED') {
      throw new ForbiddenException('Account suspended');
    }

    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowUnverified && !principal.emailVerified) {
      throw new ForbiddenException('Email verification required');
    }

    this.enforceRoles(context, principal.role);
    this.enforcePermissions(context, principal.permissions);
    return true;
  }

  private enforceMachine(context: ExecutionContext): boolean {
    // Machines can only reach routes that explicitly allow the MACHINE role.
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || !roles.includes('MACHINE')) {
      throw new ForbiddenException('Machine tokens cannot access this resource');
    }
    return true;
  }

  private enforceRoles(context: ExecutionContext, role: Role): void {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private enforcePermissions(context: ExecutionContext, granted: Permission[]): void {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return;
    const ok = required.every((p) => granted.includes(p));
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private extractBearer(req: AuthedRequest): string | null {
    const header = req.headers.authorization;
    if (!header || Array.isArray(header)) return null;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
