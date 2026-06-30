import { platform } from 'node:os';
import type { PrinterPort } from './printer.port';
import { WindowsPrinterAdapter } from './windows.adapter';
import { CupsPrinterAdapter } from './cups.adapter';
import { SimulatorPrinterAdapter } from './simulator.adapter';

/**
 * Selects the printer ADAPTER for the current platform. This is the ONLY place
 * hardware differs — the agent core depends solely on the PrinterPort.
 *
 *   - PK_PRINTER_ADAPTER=simulator  → force the simulator (CI / dev)
 *   - win32                         → WindowsPrinterAdapter
 *   - linux                         → CupsPrinterAdapter (Raspberry Pi)
 *   - anything else                 → SimulatorPrinterAdapter
 */
export function createPrinterPort(env: NodeJS.ProcessEnv = process.env): PrinterPort {
  const override = env.PK_PRINTER_ADAPTER;
  if (override === 'simulator') return new SimulatorPrinterAdapter();
  if (override === 'windows') return new WindowsPrinterAdapter();
  if (override === 'cups') return new CupsPrinterAdapter();

  switch (platform()) {
    case 'win32':
      return new WindowsPrinterAdapter();
    case 'linux':
      return new CupsPrinterAdapter();
    default:
      return new SimulatorPrinterAdapter();
  }
}
