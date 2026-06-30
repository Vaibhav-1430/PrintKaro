import { Injectable } from '@nestjs/common';
import type { Prisma } from '@print-karo/database';
import { PrismaService } from '../prisma/prisma.service';

/** Sole data-access boundary for PINs. Only the hash is ever persisted. */
@Injectable()
export class PinRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.PinUncheckedCreateInput) {
    return this.prisma.client.pin.create({ data });
  }

  findByOrderId(orderId: string) {
    return this.prisma.client.pin.findUnique({ where: { orderId } });
  }

  /** Active, non-expired PINs for a machine — candidates for redemption. */
  findActiveForMachine(machineId: string) {
    return this.prisma.client.pin.findMany({
      where: { machineId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
  }

  update(id: string, data: Prisma.PinUpdateInput) {
    return this.prisma.client.pin.update({ where: { id }, data });
  }

  incrementAttempts(id: string) {
    return this.prisma.client.pin.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  /** Active PINs across the fleet (admin view). */
  listActive() {
    return this.prisma.client.pin.findMany({
      where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
      include: { order: { select: { orderNumber: true } } },
    });
  }
}
