import type { Request } from 'express';
import type { Role, Permission } from '@print-karo/types';

/** The authenticated human principal attached to a request after a guard runs. */
export interface AuthPrincipal {
  type: 'USER';
  userId: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  permissions: Permission[];
  sessionId: string;
}

/** The authenticated machine principal attached to a request after MachineGuard. */
export interface MachinePrincipal {
  type: 'MACHINE';
  machineId: string;
  code: string;
}

export type Principal = AuthPrincipal | MachinePrincipal;

/** Express request augmented with the resolved principal + correlation id. */
export interface AuthedRequest extends Request {
  principal?: Principal;
  correlationId?: string;
}
