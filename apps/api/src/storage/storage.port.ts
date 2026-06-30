/**
 * Object storage port (hexagonal). The print pipeline never streams file bytes
 * through the API — it hands the client a presigned PUT to upload and the agent
 * a presigned GET to download. Implemented by R2StorageProvider (Cloudflare R2)
 * or FakeStorageProvider (in-process, used when R2 env vars are absent).
 */

export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface PresignedUrl {
  url: string;
  expiresAt: string;
}

export interface StorageObjectHead {
  exists: boolean;
  sizeBytes: number | null;
}

export interface StoragePort {
  /** Which provider is active ("r2" | "fake") — for diagnostics/logging. */
  readonly driver: string;

  /** Presigned PUT URL the client uploads bytes to directly. */
  presignPut(key: string, contentType: string, maxBytes: number): Promise<PresignedUrl>;

  /** Presigned GET URL the agent downloads bytes from directly. */
  presignGet(key: string): Promise<PresignedUrl>;

  /** Whether an object exists (and its size), used to confirm an upload landed. */
  head(key: string): Promise<StorageObjectHead>;

  /** Remove an object (e.g. on rejected upload). Best-effort. */
  delete(key: string): Promise<void>;
}
