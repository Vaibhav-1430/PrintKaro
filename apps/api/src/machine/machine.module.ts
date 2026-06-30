import { Global, Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrderModule } from '../order/order.module';
import { PinModule } from '../pin/pin.module';

import { MachineController } from './machine.controller';
import { MachineRuntimeController } from './machine-runtime.controller';
import { MachineAdminController } from './machine-admin.controller';

import { MachineService } from './machine.service';
import { MachineTokenService } from './machine-token.service';
import { MachineRepository } from './machine.repository';
import { MachineRegistrationService } from './machine-registration.service';
import { MachineHealthService } from './machine-health.service';
import { MachineHeartbeatService } from './machine-heartbeat.service';
import { MachineQueueService } from './machine-queue.service';
import { MachineLogsService } from './machine-logs.service';
import { MachinePrinterService } from './machine-printer.service';
import { MachineConfigService } from './machine-config.service';
import { MachineManagementService } from './machine-management.service';
import { MachineGateway } from './machine.gateway';

/**
 * Machine infrastructure module (Sprint 3): identity + JWT auth (Sprint 2),
 * registration, heartbeat ingestion, health gate, queue infrastructure, logs,
 * config delivery, admin management, and the real-time fleet gateway.
 *
 * Global so the app-wide AuthGuard can inject MachineTokenService to verify
 * Bearer tokens.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('MACHINE_JWT_SECRET'),
        signOptions: { issuer: 'print-karo', audience: 'machine' },
        verifyOptions: { issuer: 'print-karo', audience: 'machine' },
      }),
    }),
    // Sprint 4: queue consumer needs the order producer + PIN redemption.
    forwardRef(() => OrderModule),
    forwardRef(() => PinModule),
  ],
  controllers: [MachineController, MachineRuntimeController, MachineAdminController],
  providers: [
    MachineService,
    MachineTokenService,
    MachineRepository,
    MachineRegistrationService,
    MachineHealthService,
    MachineHeartbeatService,
    MachineQueueService,
    MachineLogsService,
    MachinePrinterService,
    MachineConfigService,
    MachineManagementService,
    MachineGateway,
  ],
  exports: [
    MachineTokenService,
    MachineService,
    MachineHealthService,
    MachinePrinterService,
    MachineHeartbeatService,
    MachineQueueService,
  ],
})
export class MachineModule {}
