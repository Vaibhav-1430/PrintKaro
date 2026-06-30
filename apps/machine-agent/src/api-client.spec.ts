import { describe, it, expect, vi } from 'vitest';
import { MachineApiClient, ApiError } from './api-client';

function envelope(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, meta: { correlationId: 'c' } }),
  } as Response;
}
function errorEnvelope(status: number, message = 'err') {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, error: { code: 'X', message, correlationId: 'c' } }),
  } as Response;
}

describe('MachineApiClient', () => {
  it('logs in and stores tokens', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        envelope({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, tokenType: 'Bearer' }),
      );
    const client = new MachineApiClient('http://api', 'm1', 'secret', fetchImpl as typeof fetch);
    await client.login();
    expect(client.isAuthenticated).toBe(true);
  });

  it('attaches the bearer token on authenticated calls', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, tokenType: 'Bearer' }),
      )
      .mockResolvedValueOnce(envelope({ hasJob: false, job: null }));
    const client = new MachineApiClient('http://api', 'm1', 'secret', fetchImpl as typeof fetch);
    await client.login();
    await client.pollJobs();
    const [, init] = fetchImpl.mock.calls[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer a');
  });

  it('transparently refreshes + retries once on 401', async () => {
    const fetchImpl = vi
      .fn()
      // login
      .mockResolvedValueOnce(
        envelope({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, tokenType: 'Bearer' }),
      )
      // first protected call → 401
      .mockResolvedValueOnce(errorEnvelope(401, 'expired'))
      // refresh → new tokens
      .mockResolvedValueOnce(
        envelope({ accessToken: 'a2', refreshToken: 'r2', expiresIn: 900, tokenType: 'Bearer' }),
      )
      // retry → success
      .mockResolvedValueOnce(envelope({ hasJob: false, job: null }));
    const client = new MachineApiClient('http://api', 'm1', 'secret', fetchImpl as typeof fetch);
    await client.login();
    const res = await client.pollJobs();
    expect(res.hasJob).toBe(false);
    // login + initial + refresh + retry = 4 calls
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('throws ApiError on a non-success envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorEnvelope(409, 'duplicate'));
    const client = new MachineApiClient('http://api', 'm1', 'secret', fetchImpl as typeof fetch);
    await expect(client.login()).rejects.toBeInstanceOf(ApiError);
  });

  it('reports a print result to the job/report endpoint', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, tokenType: 'Bearer' }),
      )
      .mockResolvedValueOnce(envelope({ recorded: true }));
    const client = new MachineApiClient('http://api', 'm1', 'secret', fetchImpl as typeof fetch);
    await client.login();
    const res = await client.reportPrintResult({ jobId: 'j1', success: true, pagesPrinted: 2 });
    expect(res.recorded).toBe(true);
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toContain('/machine/job/report');
    expect(JSON.parse(init.body as string)).toMatchObject({ jobId: 'j1', success: true });
  });

  it('accepts a job via the job/accept endpoint', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, tokenType: 'Bearer' }),
      )
      .mockResolvedValueOnce(envelope({ accepted: true }));
    const client = new MachineApiClient('http://api', 'm1', 'secret', fetchImpl as typeof fetch);
    await client.login();
    const res = await client.acceptJob('j1');
    expect(res.accepted).toBe(true);
  });
});
