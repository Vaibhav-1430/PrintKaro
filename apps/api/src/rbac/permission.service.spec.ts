import { PERMISSIONS, ROLES } from '@print-karo/types';
import { PermissionService } from './permission.service';
import type { PrismaService } from '../prisma/prisma.service';

function prismaWith(rows: { permission: { key: string; deletedAt: Date | null } }[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    client: { rolePermission: { findMany } },
  } as unknown as PrismaService;
  return { prisma, findMany };
}

describe('PermissionService', () => {
  it('resolves permissions from the database', async () => {
    const { prisma } = prismaWith([
      { permission: { key: PERMISSIONS.USERS_READ, deletedAt: null } },
      { permission: { key: PERMISSIONS.REPORTS_VIEW, deletedAt: null } },
    ]);
    const svc = new PermissionService(prisma);
    const perms = await svc.getPermissionsForRole(ROLES.ADMIN);
    expect(perms).toContain(PERMISSIONS.USERS_READ);
    expect(perms).toContain(PERMISSIONS.REPORTS_VIEW);
  });

  it('excludes soft-deleted permissions', async () => {
    const { prisma } = prismaWith([
      { permission: { key: PERMISSIONS.USERS_READ, deletedAt: new Date() } },
    ]);
    const svc = new PermissionService(prisma);
    const perms = await svc.getPermissionsForRole(ROLES.ADMIN);
    expect(perms).not.toContain(PERMISSIONS.USERS_READ);
  });

  it('caches results to avoid repeat DB hits', async () => {
    const { prisma, findMany } = prismaWith([
      { permission: { key: PERMISSIONS.CUSTOMER_PORTAL_ACCESS, deletedAt: null } },
    ]);
    const svc = new PermissionService(prisma);
    await svc.getPermissionsForRole(ROLES.CUSTOMER);
    await svc.getPermissionsForRole(ROLES.CUSTOMER);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('re-queries after invalidate()', async () => {
    const { prisma, findMany } = prismaWith([
      { permission: { key: PERMISSIONS.CUSTOMER_PORTAL_ACCESS, deletedAt: null } },
    ]);
    const svc = new PermissionService(prisma);
    await svc.getPermissionsForRole(ROLES.CUSTOMER);
    svc.invalidate();
    await svc.getPermissionsForRole(ROLES.CUSTOMER);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
