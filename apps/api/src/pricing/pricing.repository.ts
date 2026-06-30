import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sole data-access boundary for pricing rules. A rule is keyed by
 * (machineId, paperSize); machineId null is the global default.
 */
@Injectable()
export class PricingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The most specific active rule: machine-specific first, else global. */
  async findActiveRule(machineId: string, paperSize: string) {
    const machineRule = await this.prisma.client.pricingRule.findFirst({
      where: { machineId, paperSize, active: true, deletedAt: null },
    });
    if (machineRule) return machineRule;
    return this.prisma.client.pricingRule.findFirst({
      where: { machineId: null, paperSize, active: true, deletedAt: null },
    });
  }

  listRules() {
    return this.prisma.client.pricingRule.findMany({
      where: { deletedAt: null },
      orderBy: [{ machineId: 'asc' }, { paperSize: 'asc' }],
    });
  }

  /**
   * Upsert a rule keyed by (machineId, paperSize). Done manually rather than via
   * Prisma `upsert` because a compound unique with a nullable column (machineId
   * = null for the global rule) is not addressable by `where` (SQL NULLs are not
   * equal), so we find-then-create/update.
   */
  async upsertRule(data: {
    machineId: string | null;
    paperSize: string;
    bwPerPagePaise: number;
    colorPerPagePaise: number;
    duplexDiscountPct: number;
    active: boolean;
  }) {
    const existing = await this.prisma.client.pricingRule.findFirst({
      where: { machineId: data.machineId, paperSize: data.paperSize, deletedAt: null },
    });
    const fields = {
      bwPerPagePaise: data.bwPerPagePaise,
      colorPerPagePaise: data.colorPerPagePaise,
      duplexDiscountPct: data.duplexDiscountPct,
      active: data.active,
    };
    if (existing) {
      return this.prisma.client.pricingRule.update({ where: { id: existing.id }, data: fields });
    }
    return this.prisma.client.pricingRule.create({
      data: { machineId: data.machineId, paperSize: data.paperSize, ...fields },
    });
  }
}
