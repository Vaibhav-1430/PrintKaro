import { Logger } from '@nestjs/common';
import type { ConversionRequest, ConversionResult, FileConverterPort } from './converter.port';

const PDF_MIME = 'application/pdf';

/**
 * Deterministic converter used when FILE_CONVERTER=stub (default). PDFs pass
 * through unchanged; convertible types are reported as "converted" to the same
 * key (the real LibreOffice adapter writes a new PDF object). No native deps, so
 * build/test/boot stay green everywhere.
 */
export class StubFileConverter implements FileConverterPort {
  readonly driver = 'stub';
  private readonly logger = new Logger(StubFileConverter.name);

  needsConversion(mimeType: string): boolean {
    return mimeType !== PDF_MIME;
  }

  convert(req: ConversionRequest): Promise<ConversionResult> {
    if (!this.needsConversion(req.mimeType)) {
      return Promise.resolve({ pdfKey: req.sourceKey, converted: false });
    }
    this.logger.log(`Stub conversion ${req.mimeType} -> PDF (key=${req.targetKey})`);
    // In stub mode the source object is treated as the print-ready artifact.
    return Promise.resolve({ pdfKey: req.sourceKey, converted: true });
  }
}
