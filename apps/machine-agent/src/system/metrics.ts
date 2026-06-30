import si from 'systeminformation';

export interface SystemMetrics {
  cpuUsage: number | null;
  ramUsage: number | null;
  diskUsage: number | null;
  temperature: number | null;
}

export interface NetworkStatus {
  online: boolean;
  internet: boolean;
}

/**
 * Collects host metrics in a platform-neutral way (systeminformation works on
 * Windows, Linux/Pi and macOS). Failures degrade to null rather than throwing,
 * so a metric hiccup never stops a heartbeat.
 */
export class SystemMetricsCollector {
  async collect(): Promise<SystemMetrics> {
    try {
      const [load, mem, fs, temp] = await Promise.all([
        si.currentLoad().catch(() => null),
        si.mem().catch(() => null),
        si.fsSize().catch(() => null),
        si.cpuTemperature().catch(() => null),
      ]);

      const diskUsage = fs && fs.length > 0 ? Math.max(...fs.map((d) => d.use)) : null;

      return {
        cpuUsage: load ? round(load.currentLoad) : null,
        ramUsage: mem ? round((mem.active / mem.total) * 100) : null,
        diskUsage: diskUsage !== null ? round(diskUsage) : null,
        temperature: temp && temp.main !== null && temp.main > 0 ? round(temp.main) : null,
      };
    } catch {
      return { cpuUsage: null, ramUsage: null, diskUsage: null, temperature: null };
    }
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
