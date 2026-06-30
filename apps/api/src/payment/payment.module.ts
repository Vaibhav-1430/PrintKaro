import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentRepository } from './payment.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider';
import { PaymentSimulator } from './payment-simulator.provider';
import { OrderModule } from '../order/order.module';

/**
 * Payment module. The provider is selected by PAYMENT_PROVIDER (default
 * simulator; Razorpay added in Sprint 5). OrderModule is imported via forwardRef
 * because PaymentService transitions orders and OrderService initiates payments.
 */
@Module({
  imports: [forwardRef(() => OrderModule)],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymentRepository,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider => {
        const provider = config.get<string>('PAYMENT_PROVIDER', 'simulator');
        // Only the simulator exists in Sprint 4; Razorpay binds here in Sprint 5.
        switch (provider) {
          case 'simulator':
          default:
            return new PaymentSimulator();
        }
      },
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
