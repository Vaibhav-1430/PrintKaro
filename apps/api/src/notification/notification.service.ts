import { Inject, Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationType } from '@print-karo/database';
import { NotificationRepository } from './notification.repository';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from './notification.provider';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId?: string;
  channel?: NotificationChannel;
}

export interface NotificationView {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  orderId: string | null;
  createdAt: string;
}

/**
 * Persists a notification then dispatches it via the provider. Persistence
 * always succeeds the request; provider failures are swallowed (the in-app row
 * remains the source of truth).
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const channel: NotificationChannel = input.channel ?? 'IN_APP';
    const row = await this.repo.create({
      userId: input.userId,
      orderId: input.orderId ?? null,
      type: input.type,
      channel,
      title: input.title,
      body: input.body,
      sentAt: new Date(),
    });
    await this.provider
      .send({ userId: row.userId, type: input.type, channel, title: input.title, body: input.body })
      .catch(() => undefined);
  }

  async listMine(userId: string): Promise<NotificationView[]> {
    const rows = await this.repo.listForUser(userId);
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      channel: n.channel,
      title: n.title,
      body: n.body,
      read: n.read,
      orderId: n.orderId,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markRead(id: string, userId: string): Promise<{ read: boolean }> {
    await this.repo.markRead(id, userId);
    return { read: true };
  }
}
