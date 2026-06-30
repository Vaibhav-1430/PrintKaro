import { Injectable } from '@nestjs/common';
import type { Prisma } from '@print-karo/database';
import { PrismaService } from '../prisma/prisma.service';

/** Sole data-access boundary for notifications. */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.NotificationUncheckedCreateInput) {
    return this.prisma.client.notification.create({ data });
  }

  listForUser(userId: string, take = 50) {
    return this.prisma.client.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  markRead(id: string, userId: string) {
    return this.prisma.client.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }
}
