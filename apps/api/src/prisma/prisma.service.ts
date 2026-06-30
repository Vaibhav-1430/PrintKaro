import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { prisma, type PrismaClient } from '@print-karo/database';

/**
 * Exposes the shared Prisma client to NestJS DI and manages its lifecycle.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    // Connecting must not block liveness — if the DB is unreachable the app
    // still starts and /ready reports degraded until the database recovers.
    try {
      await this.client.$connect();
      this.logger.log('Connected to the database');
    } catch (err) {
      this.logger.warn(`Database not reachable at startup: ${String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  /** Lightweight connectivity probe for readiness checks. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
