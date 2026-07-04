import { PrismaService } from './prisma.service';

/**
 * Guards the connection-lifecycle behaviour that keeps the API stable against
 * Neon's cold-start / idle-suspend: startup connect retries, and a readiness
 * probe that tolerates the first sub-second wake-up failure.
 */
describe('PrismaService', () => {
  function makeService(client: { $connect?: jest.Mock; $queryRaw?: jest.Mock }): PrismaService {
    const service = new PrismaService();
    // Swap the shared singleton for a controllable double.
    Object.defineProperty(service, 'client', { value: client, writable: true });
    // Silence the injected logger.
    Object.defineProperty(service, 'logger', {
      value: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      writable: true,
    });
    // No real backoff delays in tests.
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
    return service;
  }

  afterEach(() => jest.restoreAllMocks());

  it('connects on the first successful attempt', async () => {
    const $connect = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ $connect });
    await service.onModuleInit();
    expect($connect).toHaveBeenCalledTimes(1);
  });

  it('retries a cold-start connect failure then succeeds', async () => {
    const $connect = jest
      .fn()
      .mockRejectedValueOnce(new Error('cold'))
      .mockResolvedValueOnce(undefined);
    const service = makeService({ $connect });
    await service.onModuleInit();
    expect($connect).toHaveBeenCalledTimes(2);
  });

  it('does not throw (preserves liveness) when every connect attempt fails', async () => {
    const $connect = jest.fn().mockRejectedValue(new Error('down'));
    const service = makeService({ $connect });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect($connect).toHaveBeenCalledTimes(5);
  });

  it('reports healthy on the first probe', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{ '1': 1 }]);
    const service = makeService({ $queryRaw });
    await expect(service.isHealthy()).resolves.toBe(true);
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });

  it('retries a flapping probe once before reporting healthy', async () => {
    const $queryRaw = jest
      .fn()
      .mockRejectedValueOnce(new Error('waking'))
      .mockResolvedValueOnce([{ '1': 1 }]);
    const service = makeService({ $queryRaw });
    await expect(service.isHealthy()).resolves.toBe(true);
    expect($queryRaw).toHaveBeenCalledTimes(2);
  });

  it('reports unhealthy after both probe attempts fail', async () => {
    const $queryRaw = jest.fn().mockRejectedValue(new Error('down'));
    const service = makeService({ $queryRaw });
    await expect(service.isHealthy()).resolves.toBe(false);
    expect($queryRaw).toHaveBeenCalledTimes(2);
  });
});
