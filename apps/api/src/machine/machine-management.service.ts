import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import {
  AUDIT_ACTIONS,
  HEARTBEAT_STALE_AFTER_SEC,
  ROLES,
  type MachineSummary,
} from '@print-karo/types';
import { MachineRepository } from './machine.repository';
import { MachineLogsService } from './machine-logs.service';
import { MachineGateway } from './machine.gateway';
import { AuditService } from '../audit/audit.service';
import { getDeviceInfo } from '../common/device-info';
import type { AuthPrincipal } from '../rbac/auth-context';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin/operator machine management. Operators are scoped to their own
 * assigned machines; admins/super-admins see the whole fleet.
 */
@Injectable()
export class MachineManagementService {
  constructor(
    private readonly repo: MachineRepository,
    private readonly logs: MachineLogsService,
    private readonly gateway: MachineGateway,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /** Resolves the operatorProfileId for an operator principal (for scoping). */
  private async operatorProfileId(actor: AuthPrincipal): Promise<string | null> {
    const profile = await this.prisma.client.operatorProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  private isOnline(lastHeartbeatAt: Date | null): boolean {
    return (
      lastHeartbeatAt !== null &&
      Date.now() - lastHeartbeatAt.getTime() < HEARTBEAT_STALE_AFTER_SEC * 1000
    );
  }

  /**
   * Public machine directory for the customer flow (landing page, machine
   * picker before sign-in). Only ACTIVE machines, only non-sensitive fields.
   */
  async publicDirectory(): Promise<
    Array<{
      id: string;
      code: string;
      name: string;
      online: boolean;
      gateResult: string;
      location: { college: string | null; building: string | null; room: string | null };
      latitude: number | null;
      longitude: number | null;
      lastHeartbeatAt: string | null;
    }>
  > {
    const machines = await this.repo.listMachines({ status: 'ACTIVE' }, 200);
    return machines.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      online: this.isOnline(m.lastHeartbeatAt),
      gateResult: m.health?.gateResult ?? 'BLOCKED',
      location: { college: m.college, building: m.building, room: m.room },
      latitude: m.latitude,
      longitude: m.longitude,
      lastHeartbeatAt: m.lastHeartbeatAt?.toISOString() ?? null,
    }));
  }

  async list(actor: AuthPrincipal, limit = 50, cursor?: string): Promise<MachineSummary[]> {
    const where =
      actor.role === ROLES.OPERATOR
        ? { operatorProfileId: (await this.operatorProfileId(actor)) ?? '__none__' }
        : {};

    const machines = await this.repo.listMachines(where, limit, cursor);
    return machines.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      type: m.type,
      status: m.status,
      runtimeState: m.health?.runtimeState ?? 'OFFLINE',
      gateResult: m.health?.gateResult ?? 'BLOCKED',
      healthScore: m.health?.healthScore ?? 0,
      printerState: m.health?.printerState ?? 'UNKNOWN',
      location: { college: m.college, building: m.building, room: m.room },
      operatorName: m.operatorProfile?.user?.name ?? null,
      lastHeartbeatAt: m.lastHeartbeatAt?.toISOString() ?? null,
      online: this.isOnline(m.lastHeartbeatAt),
    }));
  }

  /** Loads a machine, enforcing operator scope. */
  private async loadScoped(actor: AuthPrincipal, machineId: string) {
    const machine = await this.repo.findFullById(machineId);
    if (!machine) throw new NotFoundException('Machine not found');
    if (actor.role === ROLES.OPERATOR) {
      const opId = await this.operatorProfileId(actor);
      if (machine.operatorProfileId !== opId) {
        throw new ForbiddenException('Machine not assigned to you');
      }
    }
    return machine;
  }

  async detail(actor: AuthPrincipal, machineId: string) {
    const m = await this.loadScoped(actor, machineId);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      type: m.type,
      status: m.status,
      location: {
        college: m.college,
        building: m.building,
        floor: m.floor,
        room: m.room,
        latitude: m.latitude,
        longitude: m.longitude,
      },
      operator: m.operatorProfile
        ? {
            name: m.operatorProfile.user?.name ?? null,
            email: m.operatorProfile.user?.email ?? null,
          }
        : null,
      capabilities: m.capabilities,
      printer: m.printer,
      network: m.network,
      health: m.health,
      online: this.isOnline(m.lastHeartbeatAt),
      lastHeartbeatAt: m.lastHeartbeatAt?.toISOString() ?? null,
      lastAuthAt: m.lastAuthAt?.toISOString() ?? null,
    };
  }

  async suspend(actor: AuthPrincipal, machineId: string, reason: string | undefined, req: Request) {
    await this.loadScoped(actor, machineId);
    await this.repo.updateMachine(machineId, { status: 'SUSPENDED' });
    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.MACHINE_SUSPENDED,
      actorUserId: actor.userId,
      targetType: 'Machine',
      targetId: machineId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { reason },
    });
    this.gateway.emitStateChange(machineId, 'SUSPENDED');
    return { status: 'SUSPENDED' as const };
  }

  async reactivate(actor: AuthPrincipal, machineId: string, req: Request) {
    await this.loadScoped(actor, machineId);
    await this.repo.updateMachine(machineId, { status: 'ACTIVE' });
    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.MACHINE_REACTIVATED,
      actorUserId: actor.userId,
      targetType: 'Machine',
      targetId: machineId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
    return { status: 'ACTIVE' as const };
  }

  /**
   * Request a machine restart. Sprint 3 records the intent + audits + logs;
   * the command is delivered to the agent via the command channel in Sprint 4.
   */
  async requestRestart(actor: AuthPrincipal, machineId: string, req: Request) {
    await this.loadScoped(actor, machineId);
    await this.logs.recordServerEvent(machineId, 'RESTART', 'WARN', { by: actor.userId });
    const device = getDeviceInfo(req);
    await this.audit.record({
      action: AUDIT_ACTIONS.MACHINE_RESTART_REQUESTED,
      actorUserId: actor.userId,
      targetType: 'Machine',
      targetId: machineId,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
    return { requested: true };
  }

  async logs_(actor: AuthPrincipal, machineId: string, limit = 100, cursor?: string) {
    await this.loadScoped(actor, machineId);
    return this.logs.list(machineId, limit, cursor);
  }
}
