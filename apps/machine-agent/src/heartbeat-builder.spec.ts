import { describe, it, expect } from 'vitest';
import { MACHINE_RUNTIME_STATES, PRINTER_STATES } from '@print-karo/types';
import { HeartbeatBuilder } from './heartbeat-builder';
import type { PrinterPort, PrinterStatus } from './printer/printer.port';
import type { SystemMetricsCollector } from './system/metrics';
import type { NetworkChecker } from './system/network';

function makeBuilder(printerStatus: Partial<PrinterStatus>) {
  const printer = {
    platform: 'test',
    getStatus: async (): Promise<PrinterStatus> => ({
      printerName: 'Test',
      state: PRINTER_STATES.READY,
      paperRemaining: 100,
      paperSize: 'A4',
      colorAvailable: true,
      duplexAvailable: true,
      inkLevel: 80,
      tonerLevel: 80,
      errorCode: null,
      ...printerStatus,
    }),
    listPrinters: async () => [],
    getDefaultPrinter: async () => null,
  } as PrinterPort;

  const metrics = {
    collect: async () => ({ cpuUsage: 10, ramUsage: 20, diskUsage: 30, temperature: 40 }),
  } as unknown as SystemMetricsCollector;
  const network = {
    check: async () => ({ online: true, internet: true }),
  } as unknown as NetworkChecker;

  return new HeartbeatBuilder(printer, metrics, network);
}

describe('HeartbeatBuilder', () => {
  it('builds a complete heartbeat from a healthy printer', async () => {
    const hb = await makeBuilder({}).build();
    expect(hb.runtimeState).toBe(MACHINE_RUNTIME_STATES.IDLE);
    expect(hb.cpuUsage).toBe(10);
    expect(hb.internet).toBe(true);
    expect(typeof hb.timestamp).toBe('string');
  });

  it('derives OUT_OF_PAPER when paper is zero', async () => {
    const hb = await makeBuilder({ paperRemaining: 0, errorCode: 'OUT_OF_PAPER' }).build();
    expect(hb.runtimeState).toBe(MACHINE_RUNTIME_STATES.OUT_OF_PAPER);
  });

  it('derives PRINTER_OFFLINE when the printer is offline', async () => {
    const hb = await makeBuilder({ state: PRINTER_STATES.OFFLINE }).build();
    expect(hb.runtimeState).toBe(MACHINE_RUNTIME_STATES.PRINTER_OFFLINE);
  });

  it('derives LOW_INK when ink is low', async () => {
    const hb = await makeBuilder({ inkLevel: 5 }).build();
    expect(hb.runtimeState).toBe(MACHINE_RUNTIME_STATES.LOW_INK);
  });

  it('derives PRINTING when a job is active', async () => {
    const hb = await makeBuilder({}).build('job-1');
    expect(hb.runtimeState).toBe(MACHINE_RUNTIME_STATES.PRINTING);
    expect(hb.currentJobId).toBe('job-1');
  });
});
