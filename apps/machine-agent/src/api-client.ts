import type {
  ApiResponse,
  HeartbeatInput,
  MachineConfigResponse,
  MachineHealthResponse,
  MachineJobsResponse,
  MachineLogInput,
  MachineTokens,
  ReportPrintResultInput,
} from '@print-karo/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Authenticated client for the Print Karo machine API. Owns the JWT lifecycle:
 * login, store tokens, attach the access token, and transparently refresh +
 * retry once on a 401 (refresh-token rotation handled server-side).
 */
export class MachineApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly machineId: string,
    private readonly machineSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  async login(): Promise<void> {
    const tokens = await this.request<MachineTokens>('/machine/login', {
      method: 'POST',
      body: JSON.stringify({ machineId: this.machineId, machineSecret: this.machineSecret }),
      skipAuth: true,
    });
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) throw new ApiError('No refresh token', 401);
    const tokens = await this.request<MachineTokens>('/machine/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
      skipAuth: true,
    });
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  }

  sendHeartbeat(hb: HeartbeatInput): Promise<MachineHealthResponse> {
    return this.request<MachineHealthResponse>('/machine/heartbeat', {
      method: 'POST',
      body: JSON.stringify(hb),
    });
  }

  pollJobs(): Promise<MachineJobsResponse> {
    return this.request<MachineJobsResponse>('/machine/jobs', { method: 'GET' });
  }

  acceptJob(jobId: string): Promise<{ accepted: true }> {
    return this.request<{ accepted: true }>('/machine/job/accept', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  rejectJob(jobId: string, reason?: string): Promise<{ rejected: true }> {
    return this.request<{ rejected: true }>('/machine/job/reject', {
      method: 'POST',
      body: JSON.stringify({ jobId, reason }),
    });
  }

  reportPrintResult(body: ReportPrintResultInput): Promise<{ recorded: true }> {
    return this.request<{ recorded: true }>('/machine/job/report', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  fetchConfig(): Promise<MachineConfigResponse> {
    return this.request<MachineConfigResponse>('/machine/config', { method: 'GET' });
  }

  uploadLogs(logs: MachineLogInput[]): Promise<{ stored: number }> {
    return this.request<{ stored: number }>('/machine/log', {
      method: 'POST',
      body: JSON.stringify({ logs }),
    });
  }

  logout(): Promise<{ loggedOut: true }> {
    return this.request<{ loggedOut: true }>('/machine/logout', { method: 'POST' });
  }

  /** Core request with envelope handling + one transparent refresh-retry on 401. */
  private async request<T>(
    path: string,
    opts: RequestInit & { skipAuth?: boolean; isRetry?: boolean } = {},
  ): Promise<T> {
    const { skipAuth, isRetry, ...init } = opts;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (!skipAuth && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && !skipAuth && !isRetry && this.refreshToken) {
      await this.refresh();
      return this.request<T>(path, { ...opts, isRetry: true });
    }

    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!json || !json.success) {
      const message = json && !json.success ? json.error.message : `HTTP ${res.status}`;
      throw new ApiError(message, res.status);
    }
    return json.data;
  }
}
