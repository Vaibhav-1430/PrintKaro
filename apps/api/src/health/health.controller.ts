import { Controller, Get } from '@nestjs/common';
import type { HealthStatus, ReadinessStatus } from '@print-karo/types';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../rbac/decorators';

/**
 * Liveness + readiness probes (docs/api-specification.md §3.10).
 * - /health : process is up.
 * - /ready  : dependencies (DB) are reachable; used to gate traffic on deploy.
 */
@Public()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health(): HealthStatus {
    return {
      status: 'ok',
      service: 'print-karo-api',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(): Promise<ReadinessStatus> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ready' : 'degraded',
      checks: { database: dbUp ? 'up' : 'down' },
      timestamp: new Date().toISOString(),
    };
  }
}
