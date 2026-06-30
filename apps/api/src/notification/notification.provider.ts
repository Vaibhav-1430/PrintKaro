import { Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationType } from '@print-karo/database';

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export interface OutboundNotification {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
}

/**
 * Notification delivery port (hexagonal). The persisted Notification row is the
 * source of truth; the provider only dispatches the side-channel (email/SMS).
 */
export interface NotificationProvider {
  send(notification: OutboundNotification): Promise<void>;
}

/**
 * Default provider: logs the notification. Email/SMS adapters drop in later by
 * binding a different provider to NOTIFICATION_PROVIDER — no service change.
 */
export class LogNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(LogNotificationProvider.name);

  send(notification: OutboundNotification): Promise<void> {
    this.logger.log(
      `[notify:${notification.channel}] ${notification.type} -> user ${notification.userId}: ${notification.title}`,
    );
    return Promise.resolve();
  }
}
