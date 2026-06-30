/**
 * File conversion port (hexagonal). Non-PDF source documents (DOC/DOCX/PPT/PPTX,
 * images) are converted to PDF for printing. The original is always retained.
 *
 * Bound to StubFileConverter by default (deterministic, no native deps) and to
 * LibreOfficeFileConverter when FILE_CONVERTER=libreoffice on a host that has
 * `soffice`. This keeps build/test/boot green without LibreOffice — mirroring
 * the Sprint 3 printer-simulator pattern.
 */

export const FILE_CONVERTER_PORT = Symbol('FILE_CONVERTER_PORT');

export interface ConversionRequest {
  sourceKey: string;
  mimeType: string;
  /** Suggested destination key for the produced PDF. */
  targetKey: string;
}

export interface ConversionResult {
  /** The storage key of the print-ready PDF (== source key when already a PDF). */
  pdfKey: string;
  /** True when an actual conversion happened (false for passthrough PDFs). */
  converted: boolean;
}

export interface FileConverterPort {
  readonly driver: string;
  /** Whether this MIME type needs conversion to PDF. */
  needsConversion(mimeType: string): boolean;
  convert(req: ConversionRequest): Promise<ConversionResult>;
}
