import { Injectable, Logger } from '@nestjs/common';
import type { AuditActionKey } from '@print-karo/types';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: AuditActionKey;
  actorUserId?: string | null;
  actorType?: 'USER' | 'MACHINE' | 'SYSTEM';
  actorMachineId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only audit log writer. Every auth/identity event flows through here.
 * Failures to write an audit row never break the request, but are logged.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          action: entry.action,
          actorUserId: entry.actorUserId ?? null,
          actorType: entry.actorType ?? 'USER',
          actorMachineId: entry.actorMachineId ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          correlationId: entry.correlationId ?? null,
          metadata: (entry.metadata ?? undefined) as never,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log (${entry.action}): ${String(err)}`);
    }
  }
}
