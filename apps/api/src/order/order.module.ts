import { Module, forwardRef } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderAdminController } from './order-admin.controller';
import { OrderOperatorController } from './order-operator.controller';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';
import { OrderQueueService } from './order-queue.service';
import { PrintJobRepository } from './print-job.repository';
import { PricingModule } from '../pricing/pricing.module';
import { PinModule } from '../pin/pin.module';
import { NotificationModule } from '../notification/notification.module';
import { MachineModule } from '../machine/machine.module';

/**
 * Order lifecycle module. Imports PricingModule (price on options), PinModule
 * (mint/expire), NotificationModule (events) and MachineModule (the health gate
 * via MachineHeartbeatService). Exports OrderService + the queue producer and
 * PrintJobRepository so PaymentModule and MachineModule can drive transitions
 * and the consumer side of the queue. MachineModule is @Global, so no cycle here.
 */
@Module({
  imports: [PricingModule, PinModule, NotificationModule, forwardRef(() => MachineModule)],
  controllers: [OrderController, OrderAdminController, OrderOperatorController],
  providers: [OrderService, OrderRepository, OrderQueueService, PrintJobRepository],
  exports: [OrderService, OrderQueueService, PrintJobRepository],
})
export class OrderModule {}
