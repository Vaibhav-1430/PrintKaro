import { Injectable, Logger } from '@nestjs/common';

export interface VirusScanResult {
  clean: boolean;
  signature?: string;
}

export const VIRUS_SCAN_PORT = Symbol('VIRUS_SCAN_PORT');

export interface VirusScanPort {
  scan(key: string): Promise<VirusScanResult>;
}

/**
 * No-op virus scanner stub (Sprint 4). Always reports clean — a documented seam
 * for a ClamAV/cloud scanner in hardening. The Upload pipeline already records
 * and acts on the result, so swapping in a real scanner needs no other change.
 */
@Injectable()
export class VirusScanService implements VirusScanPort {
  private readonly logger = new Logger(VirusScanService.name);

  scan(key: string): Promise<VirusScanResult> {
    this.logger.debug(`Virus scan (stub) for ${key} — clean`);
    return Promise.resolve({ clean: true });
  }
}
