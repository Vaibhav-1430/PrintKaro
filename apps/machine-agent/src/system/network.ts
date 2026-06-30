import { lookup } from 'node:dns';
import { promisify } from 'node:util';
import si from 'systeminformation';
import type { NetworkStatus } from './metrics';

const dnsLookup = promisify(lookup);

/**
 * Determines local network + internet reachability. "online" = a non-internal
 * interface is up; "internet" = a DNS lookup to a well-known host resolves.
 */
export class NetworkChecker {
  async check(): Promise<NetworkStatus> {
    const online = await this.hasNetworkInterface();
    const internet = online ? await this.hasInternet() : false;
    return { online, internet };
  }

  private async hasNetworkInterface(): Promise<boolean> {
    try {
      const ifaces = await si.networkInterfaces();
      const list = Array.isArray(ifaces) ? ifaces : [ifaces];
      return list.some((i) => i.operstate === 'up' && !i.internal);
    } catch {
      return false;
    }
  }

  private async hasInternet(): Promise<boolean> {
    try {
      await dnsLookup('cloudflare.com');
      return true;
    } catch {
      return false;
    }
  }
}
