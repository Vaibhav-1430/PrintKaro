import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './notification.repository';
import { NOTIFICATION_PROVIDER, LogNotificationProvider } from './notification.provider';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    { provide: NOTIFICATION_PROVIDER, useClass: LogNotificationProvider },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
