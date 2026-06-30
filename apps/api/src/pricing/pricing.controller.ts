import { Controller, Get, Post } from '@nestjs/common';
import {
  PERMISSIONS,
  calculatePriceSchema,
  pricingRuleSchema,
  type CalculatePriceInput,
  type PricingRuleInput,
} from '@print-karo/types';
import { PricingService } from './pricing.service';
import { Customer, SuperAdmin } from '../rbac/role-decorators';
import { ZodBody } from '../common/zod-body.decorator';

/**
 * Pricing endpoints. Customers calculate a price for chosen options; super
 * admins manage the admin-configurable pricing rules.
 */
@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('pricing/calculate')
  @Customer(PERMISSIONS.ORDER_CREATE)
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
