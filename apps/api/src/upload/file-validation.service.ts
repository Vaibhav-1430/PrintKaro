import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ALLOWED_MIME_TYPES, MAX_PAGES, type AllowedMimeType } from '@print-karo/types';
import type { ExtractedMetadata } from './file-metadata.service';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Upload validation rules. The MIME/size checks run before storage is touched;
 * the page-count/encrypted checks run after metadata extraction. Pure given the
 * configured max-bytes, so fully unit-testable.
 */
@Injectable()
export class FileValidationService {
  constructor(private readonly config: ConfigService) {}

  private get maxBytes(): number {
    return this.config.get<number>('UPLOAD_MAX_BYTES', 104_857_600);
  }

  /** Pre-upload: type allowlist + size ceiling. */
  validateRequest(mimeType: string, sizeBytes: number): ValidationResult {
    if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
      return { ok: false, reason: `Unsupported file type: ${mimeType}` };
    }
    if (sizeBytes <= 0) {
      return { ok: false, reason: 'File is empty.' };
    }
    if (sizeBytes > this.maxBytes) {
      return { ok: false, reason: `File exceeds the ${this.maxBytes}-byte limit.` };
    }
    return { ok: true };
  }

  /** Post-extraction: encrypted/corrupted + page ceiling. */
  validateMetadata(meta: ExtractedMetadata): ValidationResult {
    if (meta.encrypted) {
      return { ok: false, reason: 'Password-protected or encrypted files are not supported.' };
    }
    if (meta.pageCount <= 0) {
      return { ok: false, reason: 'Could not read any pages — the file may be corrupted.' };
    }
    if (meta.pageCount > MAX_PAGES) {
      return { ok: false, reason: `Document exceeds the ${MAX_PAGES}-page limit.` };
    }
    return { ok: true };
  }
}
