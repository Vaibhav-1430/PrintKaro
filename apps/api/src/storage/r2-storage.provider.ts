import { Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignedUrl, StorageObjectHead, StoragePort } from './storage.port';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  presignTtlSec: number;
}

/**
 * Cloudflare R2 storage via the S3-compatible API. Bytes never pass through the
 * API: clients PUT to a presigned URL and the agent GETs from one. Bucket URLs
 * are never exposed — only short-lived presigned URLs.
 */
export class R2StorageProvider implements StoragePort {
  readonly driver = 'r2';
  private readonly logger = new Logger(R2StorageProvider.name);
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.logger.log(`R2 storage active (bucket=${config.bucket})`);
  }

  private expiry(): string {
    return new Date(Date.now() + this.config.presignTtlSec * 1000).toISOString();
  }

  async presignPut(key: string, contentType: string, maxBytes: number): Promise<PresignedUrl> {
    const cmd = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: maxBytes,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: this.config.presignTtlSec });
    return { url, expiresAt: this.expiry() };
  }

  async presignGet(key: string): Promise<PresignedUrl> {
    const cmd = new GetObjectCommand({ Bucket: this.config.bucket, Key: key });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: this.config.presignTtlSec });
    return { url, expiresAt: this.expiry() };
  }

  async head(key: string): Promise<StorageObjectHead> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { exists: true, sizeBytes: res.ContentLength ?? null };
    } catch {
      return { exists: false, sizeBytes: null };
    }
  }

  async delete(key: string): Promise<void> {
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }))
      .catch((err: unknown) => this.logger.warn(`R2 delete failed for ${key}: ${String(err)}`));
  }
}
