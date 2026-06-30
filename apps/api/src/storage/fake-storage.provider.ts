import { Logger } from '@nestjs/common';
import type { PresignedUrl, StorageObjectHead, StoragePort } from './storage.port';

/**
 * In-process storage stub used when R2 is not configured (local dev, CI, the
 * sandbox). It returns deterministic, obviously-fake URLs and tracks "uploaded"
 * objects in memory so the upload-confirm flow can succeed without real R2.
 * Correctness of the pipeline never depends on real bytes being present here.
 */
export class FakeStorageProvider implements StoragePort {
  readonly driver = 'fake';
  private readonly logger = new Logger(FakeStorageProvider.name);
  private readonly objects = new Map<string, number>(); // key -> sizeBytes

  constructor(private readonly presignTtlSec: number) {
    this.logger.log('No R2_* config — using in-process Fake storage');
  }

  private expiry(): string {
    return new Date(Date.now() + this.presignTtlSec * 1000).toISOString();
  }

  presignPut(key: string, _contentType: string, sizeBytes: number): Promise<PresignedUrl> {
    // Mark the object as present immediately; the client "PUT" is a no-op locally.
    this.objects.set(key, sizeBytes);
    return Promise.resolve({
      url: `http://local-storage.invalid/put/${encodeURIComponent(key)}`,
      expiresAt: this.expiry(),
    });
  }

  presignGet(key: string): Promise<PresignedUrl> {
    return Promise.resolve({
      url: `http://local-storage.invalid/get/${encodeURIComponent(key)}`,
      expiresAt: this.expiry(),
    });
  }

  head(key: string): Promise<StorageObjectHead> {
    const size = this.objects.get(key);
    return Promise.resolve({ exists: size !== undefined, sizeBytes: size ?? null });
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
