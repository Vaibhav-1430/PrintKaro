import { Injectable } from '@nestjs/common';
import type { Prisma } from '@print-karo/database';
import { PrismaService } from '../prisma/prisma.service';

/** Sole data-access boundary for orders + their print options. */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly fullInclude = {
    printOption: true,
    payment: { select: { status: true } },
    pin: { select: { status: true, expiresAt: true } },
  } satisfies Prisma.OrderInclude;

  create(data: Prisma.OrderUncheckedCreateInput) {
    return this.prisma.client.order.create({ data, include: this.fullInclude });
  }

  findById(id: string) {
    return this.prisma.client.order.findFirst({
      where: { id, deletedAt: null },
      include: this.fullInclude,
    });
  }

  /** Order with the upload + machine joined — used to build dispatch payloads. */
  findWithRelations(id: string) {
    return this.prisma.client.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...this.fullInclude,
        upload: { include: { metadata: true } },
        machine: { select: { id: true, operatorProfileId: true } },
      },
    });
  }

  update(id: string, data: Prisma.OrderUncheckedUpdateInput) {
    return this.prisma.client.order.update({
      where: { id },
      data,
      include: this.fullInclude,
    });
  }

  upsertPrintOption(
    orderId: string,
    data: Omit<Prisma.PrintOptionUncheckedCreateInput, 'orderId'>,
  ) {
    return this.prisma.client.printOption.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
    });
  }

  listForCustomer(customerProfileId: string, take = 50) {
    return this.prisma.client.order.findMany({
      where: { customerProfileId, deletedAt: null },
      include: this.fullInclude,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  listAll(where: Prisma.OrderWhereInput, take = 100) {
    return this.prisma.client.order.findMany({
      where: { ...where, deletedAt: null },
      include: this.fullInclude,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Aggregate revenue counts/sums for a machine scope (or whole fleet). */
  async revenue(where: Prisma.OrderWhereInput) {
    const base = { ...where, deletedAt: null };
    const [totalOrders, paid, completed, refunded, grossAgg, refundAgg] = await Promise.all([
      this.prisma.client.order.count({ where: base }),
      this.prisma.client.order.count({ where: { ...base, paidAt: { not: null } } }),
      this.prisma.client.order.count({ where: { ...base, status: 'COMPLETED' } }),
      this.prisma.client.order.count({ where: { ...base, status: 'REFUNDED' } }),
      this.prisma.client.order.aggregate({
        where: { ...base, paidAt: { not: null } },
        _sum: { amountPaise: true },
      }),
      this.prisma.client.order.aggregate({
        where: { ...base, status: 'REFUNDED' },
        _sum: { amountPaise: true },
      }),
    ]);
    return {
      totalOrders,
      paidOrders: paid,
      completedOrders: completed,
      refundedOrders: refunded,
      grossRevenuePaise: grossAgg._sum.amountPaise ?? 0,
      refundedPaise: refundAgg._sum.amountPaise ?? 0,
    };
  }

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.client.$transaction(fn);
  }
}
