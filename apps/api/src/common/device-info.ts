import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';

export interface DeviceInfo {
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  fingerprint: string;
}

/** Extracts the client IP, honouring a single trusted proxy hop. */
export function getClientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/** Parses device/browser/OS and computes a coarse fingerprint for sessions. */
export function getDeviceInfo(req: Request): DeviceInfo {
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
  const ipAddress = getClientIp(req);

  const parser = new UAParser(userAgent ?? undefined);
  const result = parser.getResult();

  const deviceType = result.device.type ?? 'desktop';
  const browser = result.browser.name ?? null;
  const os = result.os.name ?? null;

  const fingerprint = createHash('sha256')
    .update(`${userAgent ?? ''}|${browser ?? ''}|${os ?? ''}|${ipAddress ?? ''}`)
    .digest('hex')
    .slice(0, 32);

  return { ipAddress, userAgent, deviceType, browser, os, fingerprint };
}
