import { ConfigService } from '@nestjs/config';
import { MAX_PAGES } from '@print-karo/types';
import { FileValidationService } from './file-validation.service';
import type { ExtractedMetadata } from './file-metadata.service';

function makeService(maxBytes = 104_857_600): FileValidationService {
  const config = { get: (_k: string, d: number) => maxBytes ?? d } as unknown as ConfigService;
  return new FileValidationService(config);
}

const okMeta: ExtractedMetadata = {
  pageCount: 5,
  isColor: true,
  orientation: 'portrait',
  paperSize: 'A4',
  estimatedPrintSeconds: 15,
  widthPt: 595,
  heightPt: 842,
  encrypted: false,
};

describe('FileValidationService.validateRequest', () => {
  const svc = makeService();

  it('accepts an allowed type within size', () => {
    expect(svc.validateRequest('application/pdf', 1000).ok).toBe(true);
  });

  it('rejects an unsupported type', () => {
    const r = svc.validateRequest('application/zip', 1000);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Unsupported/);
  });

  it('rejects an empty file', () => {
    expect(svc.validateRequest('application/pdf', 0).ok).toBe(false);
  });

  it('rejects a file over the size limit', () => {
    const small = makeService(500);
    expect(small.validateRequest('application/pdf', 1000).ok).toBe(false);
  });

  it.each([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ])('accepts %s', (mime) => {
    expect(svc.validateRequest(mime, 100).ok).toBe(true);
  });
});

describe('FileValidationService.validateMetadata', () => {
  const svc = makeService();

  it('accepts healthy metadata', () => {
    expect(svc.validateMetadata(okMeta).ok).toBe(true);
  });

  it('rejects encrypted files', () => {
    const r = svc.validateMetadata({ ...okMeta, encrypted: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/encrypted/i);
  });

  it('rejects zero-page (corrupted) files', () => {
    expect(svc.validateMetadata({ ...okMeta, pageCount: 0 }).ok).toBe(false);
  });

  it('rejects documents over the page ceiling', () => {
    expect(svc.validateMetadata({ ...okMeta, pageCount: MAX_PAGES + 1 }).ok).toBe(false);
  });
});
