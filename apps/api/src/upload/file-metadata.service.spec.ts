import { PDFDocument } from 'pdf-lib';
import {
  FileMetadataService,
  classifyOrientation,
  classifyPaperSize,
  estimatePrintSeconds,
} from './file-metadata.service';

describe('metadata pure helpers', () => {
  it('estimates ~3s per page, min 1', () => {
    expect(estimatePrintSeconds(0)).toBe(3);
    expect(estimatePrintSeconds(10)).toBe(30);
  });

  it('classifies orientation', () => {
    expect(classifyOrientation(595, 842)).toBe('portrait');
    expect(classifyOrientation(842, 595)).toBe('landscape');
  });

  it('classifies standard paper sizes', () => {
    expect(classifyPaperSize(595, 842)).toBe('A4');
    expect(classifyPaperSize(842, 1191)).toBe('A3');
    expect(classifyPaperSize(612, 1008)).toBe('LEGAL');
  });

  it('falls back to A4 for unknown sizes', () => {
    expect(classifyPaperSize(100, 100)).toBe('A4');
  });
});

describe('FileMetadataService.extractFromPdf', () => {
  const svc = new FileMetadataService();

  async function makePdf(pages: number, size: [number, number] = [595, 842]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage(size);
    return doc.save();
  }

  it('reads the page count from a real PDF', async () => {
    const meta = await svc.extractFromPdf(await makePdf(3));
    expect(meta.pageCount).toBe(3);
    expect(meta.encrypted).toBe(false);
    expect(meta.paperSize).toBe('A4');
    expect(meta.estimatedPrintSeconds).toBe(9);
  });

  it('detects landscape orientation', async () => {
    const meta = await svc.extractFromPdf(await makePdf(1, [842, 595]));
    expect(meta.orientation).toBe('landscape');
  });

  it('throws on a corrupted PDF', async () => {
    await expect(svc.extractFromPdf(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/Corrupted/);
  });

  it('produces a deterministic degraded default', () => {
    const meta = svc.degradedMetadata();
    expect(meta.pageCount).toBe(1);
    expect(meta.paperSize).toBe('A4');
  });
});
