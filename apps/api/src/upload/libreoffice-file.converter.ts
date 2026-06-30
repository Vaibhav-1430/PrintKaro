import { Inject, Logger } from '@nestjs/common';
import type { ConversionRequest, ConversionResult, FileConverterPort } from './converter.port';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';

const PDF_MIME = 'application/pdf';

/**
 * Real LibreOffice-backed converter (FILE_CONVERTER=libreoffice). It downloads
 * the source from storage, shells out to `soffice --headless --convert-to pdf`,
 * and uploads the produced PDF. Requires LibreOffice (`soffice`) on the host;
 * not used in the sandbox/CI, where the stub is selected instead.
 *
 * Implemented lazily (dynamic imports of node:child_process / node:fs) so it
 * carries no static native dependency.
 */
export class LibreOfficeFileConverter implements FileConverterPort {
  readonly driver = 'libreoffice';
  private readonly logger = new Logger(LibreOfficeFileConverter.name);

  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  needsConversion(mimeType: string): boolean {
    return mimeType !== PDF_MIME;
  }

  async convert(req: ConversionRequest): Promise<ConversionResult> {
    if (!this.needsConversion(req.mimeType)) {
      return { pdfKey: req.sourceKey, converted: false };
    }

    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pk-convert-'));
    try {
      // Download the source via a presigned GET.
      const { url } = await this.storage.presignGet(req.sourceKey);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Source download failed: HTTP ${res.status}`);
      const srcPath = path.join(workDir, 'source');
      await fs.writeFile(srcPath, Buffer.from(await res.arrayBuffer()));

      await run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', workDir, srcPath]);

      const pdfBytes = await fs.readFile(path.join(workDir, 'source.pdf'));
      const put = await this.storage.presignPut(req.targetKey, PDF_MIME, pdfBytes.byteLength);
      const uploadRes = await fetch(put.url, {
        method: 'PUT',
        headers: { 'Content-Type': PDF_MIME },
        body: pdfBytes,
      });
      if (!uploadRes.ok) throw new Error(`PDF upload failed: HTTP ${uploadRes.status}`);

      return { pdfKey: req.targetKey, converted: true };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
