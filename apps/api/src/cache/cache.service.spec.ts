import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

function makeService(redisUrl?: string): CacheService {
  const config = { get: (key: string) => (key === 'REDIS_URL' ? redisUrl : undefined) };
  const svc = new CacheService(config as unknown as ConfigService);
  svc.onModuleInit();
  return svc;
}

describe('CacheService', () => {
  it('falls back to in-memory cache when no REDIS_URL is set', async () => {
    const cache = makeService(undefined);
    await cache.set('k', { v: 1 }, 60);
    expect(await cache.get('k')).toEqual({ v: 1 });
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('ignores a non-redis URL (e.g. an Upstash REST https:// endpoint) and uses memory', async () => {
    // Regression: a https:// REST URL was handed to ioredis, which cannot speak
    // HTTP and reconnected forever. It must be rejected and fall back cleanly.
    const cache = makeService('https://example.upstash.io');
    await cache.set('k', 'ok', 60);
    expect(await cache.get('k')).toBe('ok'); // served from memory, no Redis
  });

  it('expires in-memory entries after their TTL', async () => {
    const cache = makeService(undefined);
    await cache.set('k', 'v', 0); // already expired
    expect(await cache.get('k')).toBeNull();
  });
});
