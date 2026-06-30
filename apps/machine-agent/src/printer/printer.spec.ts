import { describe, it, expect } from 'vitest';
import { SimulatorPrinterAdapter } from './simulator.adapter';
import { createPrinterPort } from './printer.factory';

describe('SimulatorPrinterAdapter', () => {
  it('reports a ready default printer', async () => {
    const adapter = new SimulatorPrinterAdapter();
    const def = await adapter.getDefaultPrinter();
    expect(def?.isDefault).toBe(true);
    expect(def?.state).toBe('READY');
  });

  it('lists exactly one virtual printer', async () => {
    const adapter = new SimulatorPrinterAdapter();
    const printers = await adapter.listPrinters();
    expect(printers).toHaveLength(1);
    expect(printers[0]?.colorSupport).toBe(true);
  });

  it('produces a status snapshot with consumable levels', async () => {
    const adapter = new SimulatorPrinterAdapter();
    const status = await adapter.getStatus();
    expect(status.state).toBe('READY');
    expect(status.paperRemaining).toBeGreaterThan(0);
    expect(status.inkLevel).toBeLessThanOrEqual(100);
  });

  it('prints successfully and consumes paper', async () => {
    const adapter = new SimulatorPrinterAdapter();
    const result = await adapter.print({
      filePath: '/tmp/x.pdf',
      copies: 3,
      colorMode: 'BW',
      duplex: false,
      paperSize: 'A4',
      pageRange: null,
    });
    expect(result.success).toBe(true);
    expect(result.pagesPrinted).toBe(3);
  });

  it('fails to print when out of paper', async () => {
    const adapter = new SimulatorPrinterAdapter();
    // Drain the paper.
    await adapter.print({
      filePath: '/x',
      copies: 500,
      colorMode: 'BW',
      duplex: false,
      paperSize: 'A4',
      pageRange: null,
    });
    const result = await adapter.print({
      filePath: '/x',
      copies: 1,
      colorMode: 'BW',
      duplex: false,
      paperSize: 'A4',
      pageRange: null,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('OUT_OF_PAPER');
  });
});

describe('createPrinterPort', () => {
  it('honours the simulator override', () => {
    const port = createPrinterPort({ PK_PRINTER_ADAPTER: 'simulator' } as NodeJS.ProcessEnv);
    expect(port.platform).toBe('simulator');
  });

  it('honours the windows override', () => {
    const port = createPrinterPort({ PK_PRINTER_ADAPTER: 'windows' } as NodeJS.ProcessEnv);
    expect(port.platform).toBe('windows');
  });

  it('honours the cups override', () => {
    const port = createPrinterPort({ PK_PRINTER_ADAPTER: 'cups' } as NodeJS.ProcessEnv);
    expect(port.platform).toBe('linux-cups');
  });
});
