import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import type { MachineJob } from '@print-karo/types';
import { PrintRunner, type FsLike } from './print-runner';
import type { PrinterPort, PrintResult } from './printer/printer.port';

const bytes = new Uint8Array([1, 2, 3, 4, 5]);
const checksum = createHash('sha256').update(bytes).digest('hex');

function makeJob(over: Partial<MachineJob> = {}): MachineJob {
  return {
    jobId: 'job-1',
    orderId: 'o1',
    orderNumber: 'PK-1',
    downloadUrl: 'http://x/get',
    checksum,
    printOptions: { copies: 1, colorMode: 'BW', duplex: false, paperSize: 'A4', pageRange: null },
    expiresAt: new Date().toISOString(),
    ...over,
  };
}

function makeFs() {
  const rm = vi.fn().mockResolvedValue(undefined);
  const fs: FsLike = {
    mkdtemp: vi.fn().mockResolvedValue('/tmp/pk-print-x'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rm,
  };
  return { fs, rm };
}

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  }) as unknown as typeof fetch;
}

describe('PrintRunner.run', () => {
  it('downloads, verifies the checksum, prints, and cleans up', async () => {
    const printResult: PrintResult = { success: true, pagesPrinted: 1 };
    const printer = { print: vi.fn().mockResolvedValue(printResult) } as unknown as PrinterPort;
    const { fs, rm } = makeFs();
    const runner = new PrintRunner(printer, okFetch(), fs, '/tmp');

    const res = await runner.run(makeJob());

    expect(res.success).toBe(true);
    expect(printer.print).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: expect.stringContaining('o1.pdf'), copies: 1 }),
    );
    expect(rm).toHaveBeenCalledWith('/tmp/pk-print-x', { recursive: true, force: true });
  });

  it('fails on a download error and still cleans up nothing was written', async () => {
    const printer = { print: vi.fn() } as unknown as PrinterPort;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const { fs } = makeFs();
    const runner = new PrintRunner(printer, fetchImpl, fs, '/tmp');

    const res = await runner.run(makeJob());
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('DOWNLOAD_FAILED');
    expect(printer.print).not.toHaveBeenCalled();
  });

  it('fails on a checksum mismatch', async () => {
    const printer = { print: vi.fn() } as unknown as PrinterPort;
    const { fs } = makeFs();
    const runner = new PrintRunner(printer, okFetch(), fs, '/tmp');

    const res = await runner.run(makeJob({ checksum: 'wrong' }));
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('CHECKSUM_MISMATCH');
    expect(printer.print).not.toHaveBeenCalled();
  });

  it('always cleans up the temp dir even when printing throws', async () => {
    const printer = {
      print: vi.fn().mockRejectedValue(new Error('driver crash')),
    } as unknown as PrinterPort;
    const { fs, rm } = makeFs();
    const runner = new PrintRunner(printer, okFetch(), fs, '/tmp');

    const res = await runner.run(makeJob());
    expect(res.success).toBe(false);
    expect(rm).toHaveBeenCalled();
  });
});
