import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';

export interface ExtractedMetadata {
  pageCount: number;
  isColor: boolean;
  orientation: string;
  paperSize: string;
  widthPt: number | null;
  heightPt: number | null;
  estimatedPrintSeconds: number;
  encrypted: boolean;
}

// Standard page sizes in PostScript points (1pt = 1/72").
const PAGE_SIZES_PT: { name: string; w: number; h: number }[] = [
  { name: 'A4', w: 595, h: 842 },
  { name: 'A3', w: 842, h: 1191 },
  { name: 'LEGAL', w: 612, h: 1008 },
  { name: 'LETTER', w: 612, h: 792 },
];

/** Pure: estimate print seconds (~3s/page baseline). Used in pricing previews. */
export function estimatePrintSeconds(pageCount: number): number {
  return Math.max(1, pageCount) * 3;
}

/** Pure: classify orientation from page dimensions. */
export function classifyOrientation(widthPt: number, heightPt: number): string {
  return widthPt > heightPt ? 'landscape' : 'portrait';
}

/** Pure: nearest standard paper size from dimensions (10pt tolerance). */
export function classifyPaperSize(widthPt: number, heightPt: number): string {
  const w = Math.min(widthPt, heightPt);
  const h = Math.max(widthPt, heightPt);
  const match = PAGE_SIZES_PT.find((s) => Math.abs(s.w - w) < 10 && Math.abs(s.h - h) < 10);
  return match?.name ?? 'A4';
}

/**
 * Extracts print-relevant metadata. When the PDF bytes are available (R2 mode)
 * it parses them with pdf-lib; in Fake-storage mode (sandbox) it degrades to a
 * deterministic single-page A4 default so the pipeline stays functional.
 */
@Injectable()
export class FileMetadataService {
  private readonly logger = new Logger(FileMetadataService.name);

  /** Pure PDF parse — throws on encrypted/corrupted input. */
  async extractFromPdf(bytes: Uint8Array): Promise<ExtractedMetadata> {
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    } catch (err) {
      const message = String(err);
      if (/encrypt/i.test(message)) {
        return this.encryptedMetadata();
      }
      throw new Error(`Corrupted or unreadable PDF: ${message}`);
    }

    const pageCount = doc.getPageCount();
    const first = doc.getPage(0);
    const { width, height } = first.getSize();

    return {
      pageCount,
      isColor: true, // page-level colour detection is a hardening item; assume colour-capable
      orientation: classifyOrientation(width, height),
      paperSize: classifyPaperSize(width, height),
      widthPt: width,
      heightPt: height,
      estimatedPrintSeconds: estimatePrintSeconds(pageCount),
      encrypted: false,
    };
  }

  /** Degraded metadata when bytes are unavailable (Fake storage). */
  degradedMetadata(): ExtractedMetadata {
    return {
      pageCount: 1,
      isColor: true,
      orientation: 'portrait',
      paperSize: 'A4',
      widthPt: 595,
      heightPt: 842,
      estimatedPrintSeconds: estimatePrintSeconds(1),
      encrypted: false,
    };
  }

  private encryptedMetadata(): ExtractedMetadata {
    return {
      pageCount: 0,
      isColor: false,
      orientation: 'portrait',
      paperSize: 'A4',
      widthPt: null,
      heightPt: null,
      estimatedPrintSeconds: 0,
      encrypted: true,
    };
  }
}
