import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PORT, type StoragePort } from './storage.port';
import { R2StorageProvider } from './r2-storage.provider';
import { FakeStorageProvider } from './fake-storage.provider';

/**
 * Provides the StoragePort, picking R2 when fully configured and otherwise an
 * in-process Fake (mirrors how CacheService falls back without REDIS_URL). This
 * keeps build/test/boot green with no external storage.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StoragePort => {
        const accountId = config.get<string>('R2_ACCOUNT_ID');
        const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
        const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
        const bucket = config.get<string>('R2_BUCKET');
        const presignTtlSec = config.get<number>('R2_PRESIGN_TTL_SEC', 900);

        if (accountId && accessKeyId && secretAccessKey && bucket) {
          return new R2StorageProvider({
            accountId,
            accessKeyId,
            secretAccessKey,
            bucket,
            presignTtlSec,
          });
        }
        return new FakeStorageProvider(presignTtlSec);
      },
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
