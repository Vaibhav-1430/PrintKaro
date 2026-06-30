import { Injectable } from '@nestjs/common';
import type { Permission, Role } from '@print-karo/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves the effective permission set for a role FROM THE DATABASE
 * (RolePermission table). Cached in-process with a short TTL so the hot auth
 * path doesn't hit the DB on every request, while still honouring DB changes.
 *
 * No hardcoded authorization: roles map to permissions only via the DB.
 */
@Injectable()
export class PermissionService {
  private cache = new Map<Role, { permissions: Permission[]; expiresAt: number }>();
  private readonly ttlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getPermissionsForRole(role: Role): Promise<Permission[]> {
    const cached = this.cache.get(role);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const rows = await this.prisma.client.rolePermission.findMany({
      where: { role },
      include: { permission: true },
    });
    const permissions = rows
      .filter((r) => r.permission.deletedAt === null)
      .map((r) => r.permission.key as Permission);

    this.cache.set(role, { permissions, expiresAt: Date.now() + this.ttlMs });
    return permissions;
  }

  /** Clears the cache (call after seeding or changing role permissions). */
  invalidate(): void {
    this.cache.clear();
  }
}
