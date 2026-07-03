import { Controller, Get, Post } from '@nestjs/common';
import {
  PERMISSIONS,
  calculatePriceSchema,
  pricingRuleSchema,
  type CalculatePriceInput,
  type PricingRuleInput,
} from '@print-karo/types';
import { PricingService } from './pricing.service';
import { SuperAdmin } from '../rbac/role-decorators';
import { Public } from '../rbac/decorators';
import { ZodBody } from '../common/zod-body.decorator';

/**
 * Pricing endpoints. Anyone can calculate a price for chosen options (the
 * customer flow shows live pricing on the options page BEFORE sign-in — upload
 * and options are guest steps; auth happens right before payment). It's a pure
 * calculation over public rules: no data is read or written and no PII is
 * involved. Super admins manage the admin-configurable pricing rules.
 */
@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('pricing/calculate')
  @Public()
  calculate(@ZodBody(calculatePriceSchema) body: CalculatePriceInput) {
    return this.pricing.calculate(body);
  }

  @Get('admin/pricing/rules')
  @SuperAdmin(PERMISSIONS.PRICING_MANAGE)
  listRules() {
    return this.pricing.listRules();
  }

  @Post('admin/pricing/rules')
  @SuperAdmin(PERMISSIONS.PRICING_MANAGE)
  upsertRule(@ZodBody(pricingRuleSchema) body: PricingRuleInput) {
    return this.pricing.upsertRule(body);
  }
}
