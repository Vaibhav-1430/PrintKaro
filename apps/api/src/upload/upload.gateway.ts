import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayInit } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import type { UploadStatus } from '@print-karo/types';

/**
 * Real-time upload progress channel. Pushes status transitions (UPLOADED →
 * CONVERTING → VALIDATED/REJECTED) so the customer's upload UI updates live.
 * Mirrors MachineGateway: namespaced + CORS-scoped, broadcast-only.
 */
@WebSocketGateway({ namespace: '/uploads', cors: { origin: true, credentials: true } })
export class UploadGateway implements OnGatewayInit {
  private readonly logger = new Logger(UploadGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit(): void {
    this.logger.log('Upload gateway initialised (/uploads)');
  }

  emitUploadProgress(userId: string, uploadId: string, status: UploadStatus): void {
    this.server?.emit('upload.progress', { userId, uploadId, status });
  }
}
