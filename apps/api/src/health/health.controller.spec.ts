import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  const prismaMock = {
    isHealthy: jest.fn().mockResolvedValue(true),
  } as unknown as PrismaService;

  const controller = new HealthController(prismaMock);

  it('returns ok for liveness', () => {
    expect(controller.health().status).toBe('ok');
  });

  it('returns ready when the database is up', async () => {
    const result = await controller.ready();
    expect(result.status).toBe('ready');
    expect(result.checks.database).toBe('up');
  });
});
