import { BadRequestException } from '@nestjs/common';
import { UPLOAD_STATUSES } from '@print-karo/types';
import { UploadService } from './upload.service';
import type { UploadRepository } from './upload.repository';
import type { FileValidationService } from './file-validation.service';
import type { FileMetadataService } from './file-metadata.service';
import type { FileConversionService } from './file-conversion.service';
import type { VirusScanService } from './virus-scan.service';
import type { UploadGateway } from './upload.gateway';
import type { StoragePort } from '../storage/storage.port';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../rbac/auth-context';

const actor = { userId: 'u1' } as AuthPrincipal;

function make() {
  const repo = {
    create: jest.fn().mockResolvedValue({ id: 'up1', storageKey: 'uploads/cp1/x' }),
    findById: jest.fn(),
    findDuplicate: jest.fn(),
    listForCustomer: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockImplementation((id, data) =>
      Promise.resolve({
        id,
        customerProfileId: 'cp1',
        storageKey: 'uploads/cp1/x.pdf',
        originalFilename: 'f.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        sha256: 's',
        status: data.status ?? 'UPLOADED',
        rejectionReason: data.rejectionReason ?? null,
        createdAt: new Date(),
      }),
    ),
    upsertMetadata: jest.fn().mockResolvedValue({}),
  } as unknown as UploadRepository;
  const validation = {
    validateRequest: jest.fn().mockReturnValue({ ok: true }),
    validateMetadata: jest.fn().mockReturnValue({ ok: true }),
  } as unknown as FileValidationService;
  const metadata = {
    degradedMetadata: jest.fn().mockReturnValue({
      pageCount: 1,
      isColor: true,
      orientation: 'portrait',
      paperSize: 'A4',
      estimatedPrintSeconds: 3,
      widthPt: 595,
      heightPt: 842,
      encrypted: false,
    }),
    extractFromPdf: jest.fn(),
  } as unknown as FileMetadataService;
  const conversion = {
    driver: 'stub',
    convert: jest.fn().mockResolvedValue({ pdfKey: 'uploads/cp1/x.pdf', converted: false }),
  } as unknown as FileConversionService;
  const virus = {
    scan: jest.fn().mockResolvedValue({ clean: true }),
  } as unknown as VirusScanService;
  const gateway = { emitUploadProgress: jest.fn() } as unknown as UploadGateway;
  const storage = {
    driver: 'fake',
    presignPut: jest.fn().mockResolvedValue({ url: 'http://put', expiresAt: 'soon' }),
    presignGet: jest.fn(),
    head: jest.fn().mockResolvedValue({ exists: true, sizeBytes: 10 }),
    delete: jest.fn(),
  } as unknown as StoragePort;
  const prisma = {
    client: {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp1' }),
        create: jest.fn().mockResolvedValue({ id: 'cp1' }),
      },
    },
  } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const svc = new UploadService(
    repo,
    validation,
    metadata,
    conversion,
    virus,
    gateway,
    storage,
    prisma,
    audit,
  );
  return { svc, repo, validation, virus, storage };
}

describe('UploadService.requestUpload', () => {
  it('rejects an invalid request before touching storage', async () => {
    const { svc, validation, storage } = make();
    (validation.validateRequest as jest.Mock).mockReturnValue({ ok: false, reason: 'too big' });
    await expect(
      svc.requestUpload(actor, { filename: 'f.pdf', mimeType: 'application/pdf', sizeBytes: 9 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.presignPut).not.toHaveBeenCalled();
  });

  it('flags a duplicate when the same hash exists', async () => {
    const { svc, repo } = make();
    (repo.findDuplicate as jest.Mock).mockResolvedValue({
      id: 'dup1',
      storageKey: 'uploads/cp1/dup',
    });
    const ticket = await svc.requestUpload(actor, {
      filename: 'f.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
    });
    expect(ticket.duplicate).toBe(true);
    expect(ticket.uploadId).toBe('dup1');
  });

  it('issues a new ticket when no duplicate', async () => {
    const { svc, repo } = make();
    (repo.findDuplicate as jest.Mock).mockResolvedValue(null);
    const ticket = await svc.requestUpload(actor, {
      filename: 'f.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    });
    expect(ticket.duplicate).toBe(false);
    expect(ticket.presignedPutUrl).toBe('http://put');
  });
});

describe('UploadService.confirmUpload', () => {
  function ownedUpload() {
    return {
      id: 'up1',
      customerProfileId: 'cp1',
      storageKey: 'uploads/cp1/x',
      originalFilename: 'f.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      sha256: 's',
      status: 'PENDING',
    };
  }

  it('validates + extracts metadata (degraded) and marks VALIDATED', async () => {
    const { svc, repo } = make();
    (repo.findById as jest.Mock).mockResolvedValue(ownedUpload());
    const res = await svc.confirmUpload(actor, 'up1', {});
    expect(res.status).toBe(UPLOAD_STATUSES.VALIDATED);
    expect(repo.upsertMetadata).toHaveBeenCalled();
  });

  it('rejects when storage has no object', async () => {
    const { svc, repo, storage } = make();
    (repo.findById as jest.Mock).mockResolvedValue(ownedUpload());
    (storage.head as jest.Mock).mockResolvedValue({ exists: false, sizeBytes: null });
    await expect(svc.confirmUpload(actor, 'up1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a virus-positive upload', async () => {
    const { svc, repo, virus } = make();
    (repo.findById as jest.Mock).mockResolvedValue(ownedUpload());
    (virus.scan as jest.Mock).mockResolvedValue({ clean: false, signature: 'EICAR' });
    const res = await svc.confirmUpload(actor, 'up1', {});
    expect(res.status).toBe(UPLOAD_STATUSES.REJECTED);
  });

  it('rejects when metadata validation fails', async () => {
    const { svc, repo, validation } = make();
    (repo.findById as jest.Mock).mockResolvedValue(ownedUpload());
    (validation.validateMetadata as jest.Mock).mockReturnValue({
      ok: false,
      reason: 'too many pages',
    });
    const res = await svc.confirmUpload(actor, 'up1', {});
    expect(res.status).toBe(UPLOAD_STATUSES.REJECTED);
    expect(res.rejectionReason).toMatch(/too many pages/);
  });
});
