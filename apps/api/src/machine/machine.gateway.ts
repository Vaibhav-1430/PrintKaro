import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayInit } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import type { MachineHealthResponse } from '@print-karo/types';

/**
 * Real-time fleet channel. Pushes machine health/state changes to subscribed
 * admin dashboards. Sprint 3 broadcasts only; command-to-machine push arrives
 * with the print pipeline. Namespaced + CORS-scoped.
 */
@WebSocketGateway({ namespace: '/machines', cors: { origin: true, credentials: true } })
export class MachineGateway implements OnGatewayInit {
  private readonly logger = new Logger(MachineGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit(): void {
    this.logger.log('Machine gateway initialised (/machines)');
  }

  /** Broadcast a machine's updated health to dashboard subscribers. */
  emitHealthUpdate(health: MachineHealthResponse): void {
    this.server?.emit('machine.health', health);
  }

  /** Broadcast a machine runtime-state transition (online/offline/etc.). */
  emitStateChange(machineId: string, runtimeState: string): void {
    this.server?.emit('machine.state', { machineId, runtimeState });
  }
}
