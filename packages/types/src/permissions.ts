import { ROLES, type Role } from './roles';

/**
 * Permission keys — the unit of authorization. Guards check permissions, never
 * raw roles, so policy can change in the DB without touching controller code.
 * Format: "<resource>:<action>".
 */
export const PERMISSIONS = {
  // self-service (any authenticated human)
  PROFILE_READ: 'profile:read',
  PROFILE_UPDATE: 'profile:update',
  SESSION_MANAGE: 'session:manage',

  // customer
  CUSTOMER_PORTAL_ACCESS: 'customer:portal',

  // operator
  OPERATOR_MACHINES_MANAGE: 'operator:machines:manage',
  OPERATOR_ANALYTICS_VIEW: 'operator:analytics:view',
  OPERATOR_REVENUE_VIEW: 'operator:revenue:view',
  MACHINE_VIEW_ASSIGNED: 'machine:view:assigned',
  MACHINE_RESTART: 'machine:restart',

  // customer — print pipeline (Sprint 4)
  ORDER_CREATE: 'order:create',
  ORDER_VIEW: 'order:view',
  ORDER_PAY: 'order:pay',
  ORDER_CANCEL: 'order:cancel',

  // operator — scoped order/revenue (Sprint 4)
  ORDER_VIEW_ASSIGNED: 'order:view:assigned',

  // admin
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  OPERATORS_MANAGE: 'operators:manage',
  MACHINES_MANAGE: 'machines:manage',
  REPORTS_VIEW: 'reports:view',
  OPERATOR_CREATE: 'operator:create',
  MACHINE_REGISTER: 'machine:register',
  MACHINE_SUSPEND: 'machine:suspend',
  MACHINE_VIEW: 'machine:view',
  MACHINE_LOGS_VIEW: 'machine:logs:view',
  // admin — print pipeline (Sprint 4)
  ORDER_VIEW_ALL: 'order:view:all',
  REVENUE_VIEW_ALL: 'revenue:view:all',
  REFUND_MANAGE: 'refund:manage',
  PIN_VIEW: 'pin:view',

  // super admin only
  ADMIN_CREATE: 'admin:create',
  ROLE_MANAGE: 'role:manage',
  USER_SUSPEND: 'user:suspend',
  PRICING_MANAGE: 'pricing:manage',
  AUDIT_VIEW: 'audit:view',
  PLATFORM_SETTINGS: 'platform:settings',
  ANALYTICS_VIEW_ALL: 'analytics:view:all',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

const P = PERMISSIONS;

const SELF_SERVICE: Permission[] = [P.PROFILE_READ, P.PROFILE_UPDATE, P.SESSION_MANAGE];

/**
 * Default role → permission mapping used to SEED the database. At runtime the
 * effective permissions are always read from the DB (RolePermission table);
 * this constant is only the source of truth for the seed.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.CUSTOMER]: [
    ...SELF_SERVICE,
    P.CUSTOMER_PORTAL_ACCESS,
    P.ORDER_CREATE,
    P.ORDER_VIEW,
    P.ORDER_PAY,
    P.ORDER_CANCEL,
  ],

  [ROLES.OPERATOR]: [
    ...SELF_SERVICE,
    P.OPERATOR_MACHINES_MANAGE,
    P.OPERATOR_ANALYTICS_VIEW,
    P.OPERATOR_REVENUE_VIEW,
    P.MACHINE_VIEW_ASSIGNED,
    P.MACHINE_RESTART,
    P.ORDER_VIEW_ASSIGNED,
  ],

  [ROLES.ADMIN]: [
    ...SELF_SERVICE,
    P.USERS_READ,
    P.USERS_MANAGE,
    P.OPERATORS_MANAGE,
    P.MACHINES_MANAGE,
    P.REPORTS_VIEW,
    P.OPERATOR_CREATE,
    P.MACHINE_REGISTER,
    P.MACHINE_SUSPEND,
    P.MACHINE_VIEW,
    P.MACHINE_VIEW_ASSIGNED,
    P.MACHINE_RESTART,
    P.MACHINE_LOGS_VIEW,
    P.ORDER_VIEW_ALL,
    P.ORDER_VIEW_ASSIGNED,
    P.REVENUE_VIEW_ALL,
    P.REFUND_MANAGE,
    P.PIN_VIEW,
    P.PRICING_MANAGE,
  ],

  // Super admin gets every permission (computed below).
  [ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,

  // Machines are not humans; they have no portal permissions.
  [ROLES.MACHINE]: [],
};
