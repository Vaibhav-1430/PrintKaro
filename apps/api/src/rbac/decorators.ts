import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role, Permission } from '@print-karo/types';
import type { AuthedRequest, AuthPrincipal, MachinePrincipal } from './auth-context';

export const IS_PUBLIC_KEY = 'rbac:isPublic';
export const ROLES_KEY = 'rbac:roles';
export const PERMISSIONS_KEY = 'rbac:permissions';
export const ALLOW_UNVERIFIED_KEY = 'rbac:allowUnverified';

/** Marks a route as not requiring authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route to one of the given roles (identity check). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Require ALL of the given permissions. This is the primary authorization
 * mechanism — guards resolve effective permissions from the DB, so there is no
 * hardcoded role logic in controllers.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Allow a route to be hit by authenticated-but-unverified users. */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

/** Inject the current authenticated user principal into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const principal = req.principal;
    if (!principal || principal.type !== 'USER') {
      throw new Error('CurrentUser used on a route without a USER principal');
    }
    return principal;
  },
);

/** Inject the current authenticated machine principal into a handler param. */
export const CurrentMachine = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MachinePrincipal => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const principal = req.principal;
    if (!principal || principal.type !== 'MACHINE') {
      throw new Error('CurrentMachine used on a route without a MACHINE principal');
    }
    return principal;
  },
);
