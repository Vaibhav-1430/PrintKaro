import { randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  UPLOAD_STATUSES,
  type ConfirmUploadInput,
  type RequestUploadInput,
  type UploadResponse,
  type UploadTicketResponse,
} from '@print-karo/types';
import type { Upload, FileMetadata } from '@print-karo/database';
import { UploadRepository } from './upload.repository';
import { FileValidationService } from './file-validation.service';
import { FileMetadataService, type ExtractedMetadata } from './file-metadata.service';
import { FileConversionService } from './file-conversion.service';
import { VirusScanService } from './virus-scan.service';
import { UploadGateway } from './upload.gateway';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../rbac/auth-context';

@Injectable()
export class UploadService {
  constructor(
    private readonly repo: UploadRepository,
    private readonly validation: FileValidationService,
    private readonly metadata: FileMetadataService,
    private readonly conversion: FileConversionService,
    private readonly virus: VirusScanService,
    private readonly gateway: UploadGateway,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve the customer profile for a principal (created lazily for customers). */
  private async customerProfileId(actor: AuthPrincipal): Promise<string> {
    const existing = await this.prisma.client.customerProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.client.customerProfile.create({
      data: { userId: actor.userId },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Issue a presigned upload ticket. Validates type/size first; if a file with
   * the same hash already exists for this customer, flags it as a duplicate (the
   * client may reuse the existing upload instead of re-uploading).
   */
  async requestUpload(
    actor: AuthPrincipal,
    input: RequestUploadInput,
  ): Promise<UploadTicketResponse> {
    const check = this.validation.validateRequest(input.mimeType, input.sizeBytes);
    if (!check.ok) throw new BadRequestException(check.reason);

    const customerProfileId = await this.customerProfileId(actor);

    if (input.sha256) {
      const dup = await this.repo.findDuplicate(customerProfileId, input.sha256);
      if (dup) {
        const ticket = await this.storage.presignPut(
          dup.storageKey,
          input.mimeType,
          input.sizeBytes,
        );
        return {
          uploadId: dup.id,
          storageKey: dup.storageKey,
          presignedPutUrl: ticket.url,
          expiresAt: ticket.expiresAt,
          duplicate: true,
        };
      }
    }

    const storageKey = `uploads/${customerProfileId}/${randomUUID()}`;
    const ticket = await this.storage.presignPut(storageKey, input.mimeType, input.sizeBytes);

    const upload = await this.repo.create({
      customerProfileId,
      storageKey,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256 ?? '',
      status: UPLOAD_STATUSES.PENDING,
    });

    return {
      uploadId: upload.id,
      storageKey,
      presignedPutUrl: ticket.url,
      expiresAt: ticket.expiresAt,
      duplicate: false,
    };
  }

  /**
   * Confirm an upload completed: virus-scan, convert to PDF, extract metadata,
   * validate, and mark VALIDATED or REJECTED. Bytes are fetched server-side only
   * when real storage is configured; otherwise metadata degrades deterministically.
   */
  async confirmUpload(
    actor: AuthPrincipal,
    uploadId: string,
    input: ConfirmUploadInput,
  ): Promise<UploadResponse> {
    const upload = await this.loadOwned(actor, uploadId);

    const head = await this.storage.head(upload.storageKey);
    if (!head.exists) {
      throw new BadRequestException('Upload not found in storage — did the PUT complete?');
    }

    await this.repo.update(upload.id, { status: UPLOAD_STATUSES.UPLOADED });
    this.gateway.emitUploadProgress(actor.userId, upload.id, UPLOAD_STATUSES.UPLOADED);

    // Virus scan (stub → always clean).
    const scan = await this.virus.scan(upload.storageKey);
    if (!scan.clean) {
      return this.reject(actor, upload, `Virus detected: ${scan.signature ?? 'unknown'}`);
    }

    // Convert non-PDF sources to PDF (stub passthrough by default).
    this.gateway.emitUploadProgress(actor.userId, upload.id, UPLOAD_STATUSES.CONVERTING);
    const pdfKey = `${upload.storageKey}.pdf`;
    const conv = await this.conversion.convert(upload.storageKey, upload.mimeType, pdfKey);

    // Extract metadata from the print-ready PDF (degrade if bytes unavailable).
    const meta = await this.extractMetadata(conv.pdfKey, input.sha256 ?? upload.sha256);
    const metaCheck = this.validation.validateMetadata(meta.extracted);
    if (!metaCheck.ok) {
      return this.reject(actor, upload, metaCheck.reason ?? 'Validation failed.');
    }

    const updated = await this.repo.update(upload.id, {
      status: UPLOAD_STATUSES.VALIDATED,
      storageKey: conv.pdfKey,
      originalKey: conv.converted ? upload.storageKey : null,
      sha256: meta.sha256 || upload.sha256,
      virusScanClean: true,
    });
    await this.repo.upsertMetadata(upload.id, {
      pageCount: meta.extracted.pageCount,
      isColor: meta.extracted.isColor,
      orientation: meta.extracted.orientation,
      paperSize: meta.extracted.paperSize,
      estimatedPrintSeconds: meta.extracted.estimatedPrintSeconds,
      widthPt: meta.extracted.widthPt,
      heightPt: meta.extracted.heightPt,
      encrypted: meta.extracted.encrypted,
    });

    this.gateway.emitUploadProgress(actor.userId, upload.id, UPLOAD_STATUSES.VALIDATED);
    await this.audit.record({
      action: AUDIT_ACTIONS.FILE_UPLOADED,
      actorUserId: actor.userId,
      targetType: 'Upload',
      targetId: upload.id,
      metadata: { pages: meta.extracted.pageCount, converter: this.conversion.driver },
    });

    return this.toResponse({
      ...updated,
      metadata: await this.repo.findById(upload.id).then((u) => u?.metadata ?? null),
    });
  }

  async getUpload(actor: AuthPrincipal, uploadId: string): Promise<UploadResponse> {
    const upload = await this.loadOwned(actor, uploadId);
    return this.toResponse(upload);
  }

  async listUploads(actor: AuthPrincipal): Promise<UploadResponse[]> {
    const customerProfileId = await this.customerProfileId(actor);
    const uploads = await this.repo.listForCustomer(customerProfileId);
    return uploads.map((u) => this.toResponse(u));
  }

  // ── internals ──────────────────────────────────────────────────────

  private async loadOwned(actor: AuthPrincipal, uploadId: string) {
    const upload = await this.repo.findById(uploadId);
    if (!upload) throw new NotFoundException('Upload not found');
    const customerProfileId = await this.customerProfileId(actor);
    if (upload.customerProfileId !== customerProfileId) {
      throw new ForbiddenException('This upload does not belong to you.');
    }
    return upload;
  }

  private async extractMetadata(
    key: string,
    fallbackSha: string,
  ): Promise<{ extracted: ExtractedMetadata; sha256: string }> {
    // Fetch bytes only when real storage backs the key; degrade otherwise.
    if (this.storage.driver === 'fake') {
      return { extracted: this.metadata.degradedMetadata(), sha256: fallbackSha };
    }
    try {
      const { url } = await this.storage.presignGet(key);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const extracted = await this.metadata.extractFromPdf(bytes);
      return { extracted, sha256 };
    } catch {
      // If extraction fails on a real backend, surface as encrypted/corrupted.
      return {
        extracted: { ...this.metadata.degradedMetadata(), pageCount: 0, encrypted: false },
        sha256: fallbackSha,
      };
    }
  }

  private async reject(
    actor: AuthPrincipal,
    upload: Upload,
    reason: string,
  ): Promise<UploadResponse> {
    const updated = await this.repo.update(upload.id, {
      status: UPLOAD_STATUSES.REJECTED,
      rejectionReason: reason,
      virusScanClean: !/virus/i.test(reason),
    });
    this.gateway.emitUploadProgress(actor.userId, upload.id, UPLOAD_STATUSES.REJECTED);
    await this.audit.record({
      action: AUDIT_ACTIONS.FILE_REJECTED,
      actorUserId: actor.userId,
      targetType: 'Upload',
      targetId: upload.id,
      metadata: { reason },
    });
    return this.toResponse({ ...updated, metadata: null });
  }

  private toResponse(upload: Upload & { metadata?: FileMetadata | null }): UploadResponse {
    return {
      id: upload.id,
      originalFilename: upload.originalFilename,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      status: upload.status,
      sha256: upload.sha256,
      rejectionReason: upload.rejectionReason,
      metadata: upload.metadata
        ? {
            pageCount: upload.metadata.pageCount,
            isColor: upload.metadata.isColor,
            orientation: upload.metadata.orientation,
            paperSize: upload.metadata.paperSize,
            estimatedPrintSeconds: upload.metadata.estimatedPrintSeconds,
            encrypted: upload.metadata.encrypted,
          }
        : null,
      createdAt: upload.createdAt.toISOString(),
    };
  }
}
