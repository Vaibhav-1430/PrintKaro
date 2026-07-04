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
    // Neon serverless compute suspends when idle; the first connection after a
    // cold start can time out while it wakes. Retry with backoff so a cold DB
    // doesn't leave the app booted against a client that never warmed up.
    // Liveness is still preserved: if every attempt fails we log and continue,
    // and /ready reports degraded until the database recovers.
    await this.connectWithRetry();
  }

  private async connectWithRetry(attempts = 5, baseDelayMs = 500): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.client.$connect();
        this.logger.log('Connected to the database');
        return;
      } catch (err) {
        const last = attempt === attempts;
        const delay = baseDelayMs * 2 ** (attempt - 1);
        this.logger.warn(
          `DB connect attempt ${attempt}/${attempts} failed` +
            (last
              ? ` — continuing; /ready will gate traffic: ${String(err)}`
              : `; retrying in ${delay}ms`),
        );
        if (!last) await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  /** Lightweight connectivity probe for readiness checks. */
  async isHealthy(): Promise<boolean> {
    // One retry absorbs the sub-second Neon wake-up window so readiness doesn't
    // flap (and Render doesn't kill a healthy deploy) on the first cold query.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.client.$queryRaw`SELECT 1`;
        return true;
      } catch (err) {
        if (attempt === 1) {
          this.logger.warn(`Readiness probe failed: ${String(err)}`);
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    return false;
  }
}
