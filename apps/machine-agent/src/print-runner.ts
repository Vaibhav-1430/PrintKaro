import { createHash } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MachineJob } from '@print-karo/types';
import type { PrinterPort, PrintResult } from './printer/printer.port';

/** Minimal fs surface the runner needs — injectable for tests. */
export interface FsLike {
  mkdtemp(prefix: string): Promise<string>;
  writeFile(file: string, data: Uint8Array): Promise<void>;
  rm(target: string, options: { recursive: boolean; force: boolean }): Promise<void>;
}

const defaultFs: FsLike = {
  mkdtemp: (prefix) => fsPromises.mkdtemp(prefix),
  writeFile: (file, data) => fsPromises.writeFile(file, data),
  rm: (target, options) => fsPromises.rm(target, options),
};

/**
 * Orchestrates a single print job end-to-end, hardware-agnostically:
 *   download (presigned GET) → temp file → verify checksum → printer.print()
 *   → delete temp file (always, via finally).
 *
 * fetch/fs/printer are injected so this is fully unit-testable with fakes, and
 * identical on Windows and Pi (only the PrinterPort adapter differs).
 */
export class PrintRunner {
  constructor(
    private readonly printer: PrinterPort,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly fs: FsLike = defaultFs,
    private readonly tmpDir: string = os.tmpdir(),
  ) {}

  async run(job: MachineJob): Promise<PrintResult> {
    let workDir: string | null = null;
    try {
      const res = await this.fetchImpl(job.downloadUrl);
      if (!res.ok) {
        return {
          success: false,
          errorCode: 'DOWNLOAD_FAILED',
          errorMessage: `Download failed: HTTP ${res.status}`,
        };
      }
      const bytes = new Uint8Array(await res.arrayBuffer());

      // Verify integrity when the backend supplied a checksum.
      if (job.checksum) {
        const actual = createHash('sha256').update(bytes).digest('hex');
        if (actual !== job.checksum) {
          return {
            success: false,
            errorCode: 'CHECKSUM_MISMATCH',
            errorMessage: 'Downloaded file failed integrity check.',
          };
        }
      }

      workDir = await this.fs.mkdtemp(path.join(this.tmpDir, 'pk-print-'));
      const filePath = path.join(workDir, `${job.orderId}.pdf`);
      await this.fs.writeFile(filePath, bytes);

      return await this.printer.print({
        filePath,
        copies: job.printOptions.copies,
        colorMode: job.printOptions.colorMode,
        duplex: job.printOptions.duplex,
        paperSize: job.printOptions.paperSize,
        pageRange: job.printOptions.pageRange,
      });
    } catch (err) {
      return {
        success: false,
        errorCode: 'PRINT_RUNNER_ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Always delete the temp file — even on failure (no sensitive data lingers).
      if (workDir) {
        await this.fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }
}
