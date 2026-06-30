import type { ApiResponse, MachineJobsResponse, MachineTokens } from '@print-karo/types';
import { env } from './env';

// In production the agent holds the JWT; this screen keeps it in memory only to
// exercise the at-the-machine PIN redemption flow.
let accessToken: string | null = null;

async function apiFetch<T>(path: string, body: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw new Error(json.error.message || 'Request failed');
  return json.data;
}

export const machineApi = {
  async login(machineId: string, machineSecret: string): Promise<MachineTokens> {
    const tokens = await apiFetch<MachineTokens>('/machine/login', { machineId, machineSecret });
    accessToken = tokens.accessToken;
    return tokens;
  },
  get isAuthenticated(): boolean {
    return accessToken !== null;
  },
  redeemPin: (pin: string) => apiFetch<MachineJobsResponse>('/machine/pin/redeem', { pin }, true),
};
