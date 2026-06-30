import { Injectable } from '@nestjs/common';
import type { Prisma } from '@print-karo/database';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Single data-access boundary for the machine domain. All Prisma queries for
 * machines, credentials, heartbeats, health, logs and config live here so the
 * services stay free of persistence details (Repository pattern).
 */
@Injectable()
export class MachineRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Machine + sub-records ──────────────────────────────────────────

  findActiveById(id: string) {
    return this.prisma.client.machine.findFirst({
      where: { id, deletedAt: null },
      include: { credential: true },
    });
  }

  findByCode(code: string) {
    return this.prisma.client.machine.findFirst({ where: { code, deletedAt: null } });
  }

  findFullById(id: string) {
    return this.prisma.client.machine.findFirst({
      where: { id, deletedAt: null },
      include: {
        capabilities: true,
        printer: true,
        network: true,
        configuration: true,
        health: true,
        operatorProfile: { include: { user: { select: { name: true, email: true } } } },
      },
    });
  }

  createMachine(data: Prisma.MachineCreateInput) {
    return this.prisma.client.machine.create({ data });
  }

  updateMachine(id: string, data: Prisma.MachineUpdateInput) {
    return this.prisma.client.machine.update({ where: { id }, data });
  }

  listMachines(where: Prisma.MachineWhereInput, take: number, cursor?: string) {
    return this.prisma.client.machine.findMany({
      where: { ...where, deletedAt: null },
      include: { health: true, operatorProfile: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  // ── Heartbeat (append) + snapshots (upsert) ────────────────────────

  createHeartbeat(data: Prisma.MachineHeartbeatUncheckedCreateInput) {
    return this.prisma.client.machineHeartbeat.create({ data });
  }

  upsertPrinter(machineId: string, data: Prisma.MachinePrinterUncheckedCreateInput) {
    const { machineId: _omit, id: _id, ...rest } = data;
    return this.prisma.client.machinePrinter.upsert({
      where: { machineId },
      create: { machineId, ...rest },
      update: rest,
    });
  }

  upsertNetwork(machineId: string, data: Prisma.MachineNetworkUncheckedCreateInput) {
    const { machineId: _omit, id: _id, ...rest } = data;
    return this.prisma.client.machineNetwork.upsert({
      where: { machineId },
      create: { machineId, ...rest },
      update: rest,
    });
  }

  upsertHealth(machineId: string, data: Prisma.MachineHealthUncheckedCreateInput) {
    const { machineId: _omit, id: _id, ...rest } = data;
    return this.prisma.client.machineHealth.upsert({
      where: { machineId },
      create: { machineId, ...rest },
      update: rest,
    });
  }

  getHealth(machineId: string) {
    return this.prisma.client.machineHealth.findUnique({ where: { machineId } });
  }

  // ── Config + capabilities ──────────────────────────────────────────

  getConfiguration(machineId: string) {
    return this.prisma.client.machineConfiguration.findUnique({ where: { machineId } });
  }

  getCapabilities(machineId: string) {
    return this.prisma.client.machineCapabilities.findUnique({ where: { machineId } });
  }

  // ── Logs ───────────────────────────────────────────────────────────

  createLogs(rows: Prisma.MachineLogUncheckedCreateInput[]) {
    return this.prisma.client.machineLog.createMany({ data: rows });
  }

  listLogs(machineId: string, take: number, cursor?: string) {
    return this.prisma.client.machineLog.findMany({
      where: { machineId },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  // ── Transactions ───────────────────────────────────────────────────

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.client.$transaction(fn);
  }
}
