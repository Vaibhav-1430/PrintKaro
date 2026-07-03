import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cache-aside abstraction. Uses Redis when REDIS_URL is configured, otherwise
 * falls back to an in-process TTL map so the app (and tests) run with no Redis.
 * Correctness never depends on the cache — it only accelerates hot reads.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.log('No REDIS_URL set — using in-memory cache fallback');
      return;
    }

    // ioredis only speaks the RESP protocol over redis://|rediss://. A common
    // misconfig is pasting an Upstash REST endpoint (https://…), which ioredis
    // can't use — it would ENOENT and reconnect forever. Reject anything that
    // isn't a Redis URL up front and fall back to memory cleanly.
    if (!/^rediss?:\/\//i.test(url)) {
      this.logger.warn(
        `REDIS_URL is not a redis:// or rediss:// URL (got "${url.split('://')[0]}://…") — ` +
          'using in-memory cache fallback. For Upstash, use the redis:// connection string, not the REST URL.',
      );
      return;
    }

    try {
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        // Give up after a few reconnect attempts instead of looping forever
        // (which floods logs and holds a doomed socket open). Correctness never
        // depends on the cache, so falling back to memory is safe.
        retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
      });
      this.redis.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
      // When ioredis exhausts retries it emits 'end'; drop to memory then.
      this.redis.on('end', () => {
        if (this.redis) {
          this.logger.warn('Redis connection ended — using in-memory cache fallback');
          this.redis = null;
        }
      });
      void this.redis.connect().catch((err) => {
        this.logger.warn(`Redis connect failed, falling back to memory: ${String(err)}`);
        // disconnect() stops ioredis's internal reconnect loop; nulling the
        // reference alone would leave it retrying in the background.
        this.redis?.disconnect();
        this.redis = null;
      });
    } catch (err) {
      this.logger.warn(`Redis init failed: ${String(err)}`);
      this.redis?.disconnect();
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  async get<T>(key: string): Promise<T | null> {
    let raw: string | null = null;
    if (this.redis) {
      raw = await this.redis.get(key).catch(() => null);
    } else {
      const hit = this.memory.get(key);
      if (hit && hit.expiresAt > Date.now()) raw = hit.value;
      else if (hit) this.memory.delete(key);
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.redis) {
      await this.redis.set(key, raw, 'EX', ttlSec).catch(() => undefined);
    } else {
      this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSec * 1000 });
    }
  }

  async del(key: string): Promise<void> {
    if (this.redis) await this.redis.del(key).catch(() => undefined);
    else this.memory.delete(key);
  }
}
