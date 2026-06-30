import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { UploadModule } from './upload/upload.module';
import { PricingModule } from './pricing/pricing.module';
import { PinModule } from './pin/pin.module';
import { PaymentModule } from './payment/payment.module';
import { NotificationModule } from './notification/notification.module';
import { OrderModule } from './order/order.module';
import { AuditModule } from './audit/audit.module';
import { EmailModule } from './email/email.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthCoreModule } from './auth/auth-core.module';
import { AuthModule } from './auth/auth.module';
import { MachineModule } from './machine/machine.module';
import { UsersModule } from './users/users.module';
import { AuthGuard } from './rbac/auth.guard';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule,
    // Global rate limiting (per-route overrides via @Throttle).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('RATE_LIMIT_TTL', 60) * 1000,
            limit: config.get<number>('RATE_LIMIT_MAX', 120),
          },
        ],
      }),
    }),
    PrismaModule,
    CacheModule,
    StorageModule,
    AuditModule,
    EmailModule,
    AuthCoreModule,
    RbacModule,
    MachineModule,
    HealthModule,
    AuthModule,
    UsersModule,
    // Sprint 4: print pipeline.
    PricingModule,
    UploadModule,
    PinModule,
    PaymentModule,
    NotificationModule,
    OrderModule,
  ],
  providers: [
    // Order matters: rate-limit first, then authenticate/authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
