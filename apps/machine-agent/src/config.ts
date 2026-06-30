import { HEARTBEAT_INTERVAL_SEC } from '@print-karo/types';

/**
 * Agent runtime configuration, resolved from environment (later the OS
 * keystore). The same shape is used on Windows and Raspberry Pi.
 */
export interface AgentConfig {
  apiBaseUrl: string;
  machineId: string;
  machineSecret: string;
  heartbeatIntervalSec: number;
  queuePollIntervalSec: number;
  logUploadIntervalSec: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const required = (key: string): string => {
    const v = env[key];
    if (!v) throw new Error(`[agent] Missing required env var: ${key}`);
    return v;
  };

  return {
    apiBaseUrl: env.PK_API_BASE_URL ?? 'http://localhost:4000',
    machineId: required('PK_MACHINE_ID'),
    machineSecret: required('PK_MACHINE_SECRET'),
    heartbeatIntervalSec: Number(env.PK_HEARTBEAT_INTERVAL_SEC ?? HEARTBEAT_INTERVAL_SEC),
    queuePollIntervalSec: Number(env.PK_QUEUE_POLL_INTERVAL_SEC ?? 15),
    logUploadIntervalSec: Number(env.PK_LOG_UPLOAD_INTERVAL_SEC ?? 60),
    reconnectBaseMs: Number(env.PK_RECONNECT_BASE_MS ?? 1000),
    reconnectMaxMs: Number(env.PK_RECONNECT_MAX_MS ?? 30000),
  };
}
