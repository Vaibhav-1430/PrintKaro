import { z } from 'zod';

/**
 * Upload domain (Sprint 4). The client requests a presigned PUT ticket, uploads
 * bytes directly to object storage, then confirms — the API never touches file
 * bytes, only metadata. De-duplication is by sha256.
 */

export const UPLOAD_STATUSES = {
  PENDING: 'PENDING',
  UPLOADED: 'UPLOADED',
  CONVERTING: 'CONVERTING',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
} as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[keyof typeof UPLOAD_STATUSES];

/** Allowed source document MIME types. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'image/png',
  'image/jpeg',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Hard ceilings (also enforced server-side from env). */
export const MAX_UPLOAD_BYTES = 104_857_600; // 100 MB
export const MAX_PAGES = 500;

// ── Request a presigned upload ticket ────────────────────────────────
export const requestUploadSchema = z.object({
  filename: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().min(1).max(160),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, `File exceeds the ${MAX_UPLOAD_BYTES} byte limit.`),
  // Optional client-computed hash; the server re-derives authoritatively on confirm.
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'sha256 must be 64 hex chars.')
    .optional(),
});
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

// ── Confirm an upload completed ──────────────────────────────────────
export const confirmUploadSchema = z.object({
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'sha256 must be 64 hex chars.')
    .optional(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

// ── Response DTOs ────────────────────────────────────────────────────
export interface UploadTicketResponse {
  uploadId: string;
  storageKey: string;
  /** Presigned PUT URL — the client uploads bytes here directly. */
  presignedPutUrl: string;
  expiresAt: string;
  /** True when an identical file (same sha256) already exists for this user. */
  duplicate: boolean;
}

export interface FileMetadataResponse {
  pageCount: number;
  isColor: boolean;
  orientation: string;
  paperSize: string;
  estimatedPrintSeconds: number;
  encrypted: boolean;
}

export interface UploadResponse {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadStatus;
  sha256: string;
  rejectionReason: string | null;
  metadata: FileMetadataResponse | null;
  createdAt: string;
}
