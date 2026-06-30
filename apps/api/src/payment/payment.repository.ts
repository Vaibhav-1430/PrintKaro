import { Injectable } from '@nestjs/common';
import type { Prisma } from '@print-karo/database';
import { PrismaService } from '../prisma/prisma.service';

/** Sole data-access boundary for payments + their transactions. */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.PaymentUncheckedCreateInput) {
    return this.prisma.client.payment.create({ data });
  }

  findByOrderId(orderId: string) {
    return this.prisma.client.payment.findUnique({
      where: { orderId },
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    });
  }

  findById(id: string) {
    return this.prisma.client.payment.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.PaymentUncheckedUpdateInput) {
    return this.prisma.client.payment.update({ where: { id }, data });
  }

  addTransaction(data: Prisma.TransactionUncheckedCreateInput) {
    return this.prisma.client.transaction.create({ data });
  }

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.client.$transaction(fn);
  }
}
