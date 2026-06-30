import { applyDecorators } from '@nestjs/common';
import { ROLES, type Permission } from '@print-karo/types';
import { RequirePermissions, Roles } from './decorators';

/**
 * Role-scoped guard decorators. They are thin compositions over the central
 * AuthGuard's metadata (@Roles / @RequirePermissions) so authorization logic
 * lives in exactly ONE place. Optionally also require permissions.
 *
 * Usage:  @SuperAdmin(PERMISSIONS.ADMIN_CREATE)
 */
export const SuperAdmin = (...permissions: Permission[]) =>
  applyDecorators(Roles(ROLES.SUPER_ADMIN), RequirePermissions(...permissions));

export const Admin = (...permissions: Permission[]) =>
  applyDecorators(Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN), RequirePermissions(...permissions));

export const Operator = (...permissions: Permission[]) =>
  applyDecorators(Roles(ROLES.OPERATOR), RequirePermissions(...permissions));

export const Customer = (...permissions: Permission[]) =>
  applyDecorators(Roles(ROLES.CUSTOMER), RequirePermissions(...permissions));

export const MachineOnly = () => applyDecorators(Roles(ROLES.MACHINE));

/** Any authenticated human (no role restriction, just self-service perms). */
export const Authenticated = (...permissions: Permission[]) =>
  applyDecorators(RequirePermissions(...permissions));
