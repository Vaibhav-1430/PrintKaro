import { Injectable } from '@nestjs/common';
import type {
  CalculatePriceInput,
  PriceBreakdown,
  PricingRuleInput,
  PricingRuleResponse,
} from '@print-karo/types';
import { PricingRepository } from './pricing.repository';
import { computePrice, type ResolvedPricingRule } from './price-calculator';

/**
 * Default pricing used when no DB rule matches — keeps the pipeline functional
 * before an admin configures rules (BW ₹2/page, colour ₹10/page, no duplex
 * discount). Mirrors the Prisma model defaults.
 */
const DEFAULT_RULE: ResolvedPricingRule = {
  bwPerPagePaise: 200,
  colorPerPagePaise: 1000,
  duplexDiscountPct: 0,
};

@Injectable()
export class PricingService {
  constructor(private readonly repo: PricingRepository) {}

  /** Resolve the rule for (machine, paperSize) then compute via the pure calculator. */
  async calculate(input: CalculatePriceInput): Promise<PriceBreakdown> {
    const rule = await this.repo.findActiveRule(input.machineId, input.paperSize);
    const resolved: ResolvedPricingRule = rule
      ? {
          bwPerPagePaise: rule.bwPerPagePaise,
          colorPerPagePaise: rule.colorPerPagePaise,
          duplexDiscountPct: rule.duplexDiscountPct,
        }
      : DEFAULT_RULE;
    return computePrice(resolved, input);
  }

  async listRules(): Promise<PricingRuleResponse[]> {
    const rules = await this.repo.listRules();
    return rules.map((r) => ({
      id: r.id,
      machineId: r.machineId,
      paperSize: r.paperSize,
      bwPerPagePaise: r.bwPerPagePaise,
      colorPerPagePaise: r.colorPerPagePaise,
      duplexDiscountPct: r.duplexDiscountPct,
      active: r.active,
    }));
  }

  async upsertRule(input: PricingRuleInput): Promise<PricingRuleResponse> {
    const r = await this.repo.upsertRule({
      machineId: input.machineId ?? null,
      paperSize: input.paperSize,
      bwPerPagePaise: input.bwPerPagePaise,
      colorPerPagePaise: input.colorPerPagePaise,
      duplexDiscountPct: input.duplexDiscountPct,
      active: input.active,
    });
    return {
      id: r.id,
      machineId: r.machineId,
      paperSize: r.paperSize,
      bwPerPagePaise: r.bwPerPagePaise,
      colorPerPagePaise: r.colorPerPagePaise,
      duplexDiscountPct: r.duplexDiscountPct,
      active: r.active,
    };
  }
}
