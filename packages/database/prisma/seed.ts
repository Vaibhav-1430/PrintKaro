import { randomBytes, scrypt, type ScryptOptions } from 'node:crypto';
import { PrismaClient, type Role } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '@print-karo/types';

const prisma = new PrismaClient();

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  opts: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * Hash a password in Better Auth's default credential format so the seeded
 * super-admin can sign in through Better Auth. Format: "<saltHex>:<keyHex>"
 * using scrypt(N=16384, r=16, p=1, dkLen=64) — matching better-auth's defaults.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString('hex')}`;
}

async function seedPermissions(): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${ALL_PERMISSIONS.length} permissions.`);
}

async function seedRolePermissions(): Promise<void> {
  const permByKey = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id] as const),
  );

  for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const key of perms) {
      const permissionId = permByKey.get(key);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role as Role, permissionId } },
        update: {},
        create: { role: role as Role, permissionId },
      });
    }
  }
  // eslint-disable-next-line no-console
  console.log('Seeded role -> permission mappings.');
}

async function seedSuperAdmin(): Promise<void> {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@printkaro.local').toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe!SuperAdmin1';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Super admin already exists: ${email}`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Print Karo Super Admin',
      role: ROLES.SUPER_ADMIN,
      emailVerified: true,
      status: 'ACTIVE',
      isActive: true,
      adminProfile: { create: { isSuperAdmin: true, department: 'Platform' } },
      accounts: {
        create: {
          accountId: email,
          providerId: 'credential',
          password: await hashPassword(password),
        },
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Created SUPER_ADMIN: ${email} (id=${user.id})`);
  // eslint-disable-next-line no-console
  console.log(`  initial password: ${password}  (change immediately)`);
}

async function main(): Promise<void> {
  await seedPermissions();
  await seedRolePermissions();
  await seedSuperAdmin();

  // Sanity: super admin must have every permission.
  const saPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.SUPER_ADMIN];
  if (saPerms.length !== ALL_PERMISSIONS.length) {
    throw new Error('SUPER_ADMIN must hold all permissions');
  }
  if (!ALL_PERMISSIONS.includes(PERMISSIONS.AUDIT_VIEW)) {
    throw new Error('Permission catalog inconsistent');
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
