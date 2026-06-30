import { NotFoundException } from '@nestjs/common';
import { ROLES } from '@print-karo/types';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { Auth } from '@print-karo/auth';
import type { AuthPrincipal } from '../rbac/auth-context';

const principal: AuthPrincipal = {
  type: 'USER',
  userId: 'u1',
  email: 'a@b.com',
  role: ROLES.CUSTOMER,
  emailVerified: true,
  status: 'ACTIVE',
  permissions: [],
  sessionId: 's1',
};

const req = { headers: {}, ip: '127.0.0.1', socket: {} } as never;
const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
const auth = {} as unknown as Auth;

describe('AuthService', () => {
  it('me() returns the user profile', async () => {
    const prisma = {
      client: {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            name: 'A',
            role: ROLES.CUSTOMER,
            emailVerified: true,
            status: 'ACTIVE',
            customerProfile: { phone: '123' },
          }),
        },
      },
    } as unknown as PrismaService;
    const svc = new AuthService(auth, prisma, audit);
    const me = await svc.me(principal);
    expect(me.email).toBe('a@b.com');
    expect(me.phone).toBe('123');
  });

  it('me() throws when user missing', async () => {
    const prisma = {
      client: { user: { findFirst: jest.fn().mockResolvedValue(null) } },
    } as unknown as PrismaService;
    const svc = new AuthService(auth, prisma, audit);
    await expect(svc.me(principal)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listSessions() flags the current session', async () => {
    const prisma = {
      client: {
        session: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 's1',
              deviceType: 'desktop',
              browser: 'Chrome',
              os: 'Windows',
              ipAddress: '1.1.1.1',
              country: null,
              lastActivityAt: new Date(),
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 1000),
            },
            {
              id: 's2',
              deviceType: 'mobile',
              browser: 'Safari',
              os: 'iOS',
              ipAddress: '2.2.2.2',
              country: null,
              lastActivityAt: new Date(),
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 1000),
            },
          ]),
        },
      },
    } as unknown as PrismaService;
    const svc = new AuthService(auth, prisma, audit);
    const sessions = await svc.listSessions(principal);
    expect(sessions.find((s) => s.id === 's1')?.current).toBe(true);
    expect(sessions.find((s) => s.id === 's2')?.current).toBe(false);
  });

  it('revokeSession() rejects a session not owned by the user', async () => {
    const prisma = {
      client: { session: { findFirst: jest.fn().mockResolvedValue(null) } },
    } as unknown as PrismaService;
    const svc = new AuthService(auth, prisma, audit);
    await expect(svc.revokeSession(principal, 'sX', req)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateProfile() updates name + customer profile and audits', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'New Name',
      role: ROLES.CUSTOMER,
      emailVerified: true,
      status: 'ACTIVE',
    });
    const prisma = { client: { user: { update } } } as unknown as PrismaService;
    const svc = new AuthService(auth, prisma, audit);
    const result = await svc.updateProfile(
      principal,
      { name: 'New Name', phone: '999', defaultCity: 'Delhi' },
      req,
    );
    expect(result.name).toBe('New Name');
    expect(update).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('revokeSession() revokes a session owned by the user', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      client: {
        session: {
          findFirst: jest.fn().mockResolvedValue({ id: 's9', userId: 'u1' }),
          update,
        },
      },
    } as unknown as PrismaService;
    const svc = new AuthService(auth, prisma, audit);
    await svc.revokeSession(principal, 's9', req);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revoked: true }) }),
    );
  });

  it('logoutAll() revokes and audits', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 4 });
    const prisma = {
      client: { session: { updateMany } },
    } as unknown as PrismaService;
    const svc = new AuthService(auth, prisma, audit);
    const result = await svc.logoutAll(principal, req);
    expect(result.revoked).toBe(4);
    expect(audit.record).toHaveBeenCalled();
  });
});
