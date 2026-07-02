import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS, ROLES } from '@print-karo/types';
import { AuthGuard } from './auth.guard';
import { ALLOW_UNVERIFIED_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY, ROLES_KEY } from './decorators';
import type { AuthPrincipal } from './auth-context';
import type { SessionService } from './session.service';
import type { MachineTokenService } from '../machine/machine-token.service';

function makeContext(req: Record<string, unknown>, meta: Record<string, unknown> = {}) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => meta[key]);

  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  return { ctx, reflector };
}

const baseUser: AuthPrincipal = {
  type: 'USER',
  userId: 'u1',
  email: 'a@b.com',
  phoneNumber: '+919876543210',
  role: ROLES.CUSTOMER,
  emailVerified: true,
  phoneNumberVerified: false,
  verified: true,
  status: 'ACTIVE',
  permissions: [PERMISSIONS.PROFILE_READ, PERMISSIONS.CUSTOMER_PORTAL_ACCESS],
  sessionId: 's1',
};

function guardWith(
  sessionPrincipal: AuthPrincipal | null,
  machine?: { machineId: string; code: string },
) {
  const sessions = {
    resolve: jest.fn().mockResolvedValue(sessionPrincipal),
  } as unknown as SessionService;
  const machineTokens = {
    verifyAccessToken: jest.fn().mockResolvedValue(machine ?? { machineId: 'm1', code: 'PK-1' }),
  } as unknown as MachineTokenService;
  return { sessions, machineTokens };
}

describe('AuthGuard', () => {
  it('allows @Public routes without authentication', async () => {
    const { sessions, machineTokens } = guardWith(null);
    const { ctx, reflector } = makeContext({ headers: {} }, { [IS_PUBLIC_KEY]: true });
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const { sessions, machineTokens } = guardWith(null);
    const { ctx, reflector } = makeContext({ headers: {} });
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blocks suspended users', async () => {
    const { sessions, machineTokens } = guardWith({ ...baseUser, status: 'SUSPENDED' });
    const { ctx, reflector } = makeContext({ headers: {} });
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks unverified users unless @AllowUnverified', async () => {
    const { sessions, machineTokens } = guardWith({
      ...baseUser,
      emailVerified: false,
      verified: false,
    });
    const denied = makeContext({ headers: {} });
    const guardA = new AuthGuard(denied.reflector, sessions, machineTokens);
    await expect(guardA.canActivate(denied.ctx)).rejects.toBeInstanceOf(ForbiddenException);

    const allowed = makeContext({ headers: {} }, { [ALLOW_UNVERIFIED_KEY]: true });
    const guardB = new AuthGuard(allowed.reflector, sessions, machineTokens);
    await expect(guardB.canActivate(allowed.ctx)).resolves.toBe(true);
  });

  it('enforces role restrictions', async () => {
    const { sessions, machineTokens } = guardWith(baseUser);
    const { ctx, reflector } = makeContext({ headers: {} }, { [ROLES_KEY]: [ROLES.ADMIN] });
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces permission requirements (all required)', async () => {
    const { sessions, machineTokens } = guardWith(baseUser);
    const { ctx, reflector } = makeContext(
      { headers: {} },
      { [PERMISSIONS_KEY]: [PERMISSIONS.USERS_MANAGE] },
    );
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when the user holds the required permission', async () => {
    const { sessions, machineTokens } = guardWith(baseUser);
    const { ctx, reflector } = makeContext(
      { headers: {} },
      { [PERMISSIONS_KEY]: [PERMISSIONS.CUSTOMER_PORTAL_ACCESS] },
    );
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('lets a valid machine token reach a MACHINE-only route', async () => {
    const { sessions, machineTokens } = guardWith(null, { machineId: 'm1', code: 'PK-1' });
    const { ctx, reflector } = makeContext(
      { headers: { authorization: 'Bearer abc' } },
      { [ROLES_KEY]: [ROLES.MACHINE] },
    );
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('forbids a machine token on a non-machine route', async () => {
    const { sessions, machineTokens } = guardWith(null, { machineId: 'm1', code: 'PK-1' });
    const { ctx, reflector } = makeContext(
      { headers: { authorization: 'Bearer abc' } },
      { [ROLES_KEY]: [ROLES.ADMIN] },
    );
    const guard = new AuthGuard(reflector, sessions, machineTokens);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
