/**
 * Role-based access control roles (Sprint 2).
 * The canonical role set lives in the database `Role` enum; this mirror keeps
 * FE/BE in sync. Authorization decisions are made against PERMISSIONS, not
 * hardcoded role checks (see permissions.ts), so roles here are identity labels.
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  CUSTOMER: 'CUSTOMER',
  MACHINE: 'MACHINE',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

/** Roles that represent human staff (non-customer, non-machine). */
export const STAFF_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPERATOR];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}
