import { AUDIT_ACTIONS } from '@print-karo/types';
import { AuditService } from './audit.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  it('writes an audit row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { client: { auditLog: { create } } } as unknown as PrismaService;
    const svc = new AuditService(prisma);
    await svc.record({ action: AUDIT_ACTIONS.USER_LOGIN, actorUserId: 'u1' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'USER_LOGIN' }) }),
    );
  });

  it('never throws when the DB write fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const prisma = { client: { auditLog: { create } } } as unknown as PrismaService;
    const svc = new AuditService(prisma);
    await expect(svc.record({ action: AUDIT_ACTIONS.LOGIN_FAILED })).resolves.toBeUndefined();
  });
});
