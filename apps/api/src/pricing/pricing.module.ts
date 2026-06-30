import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PricingRepository } from './pricing.repository';

@Module({
  controllers: [PricingController],
  providers: [PricingService, PricingRepository],
  exports: [PricingService],
})
export class PricingModule {}
