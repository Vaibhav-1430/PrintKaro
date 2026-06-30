import type { ErrorCode } from './error-codes';

/**
 * Standard API response envelope.
 * Mirrors docs/api-specification.md §1.1.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: {
    correlationId: string;
  };
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    correlationId: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Health/readiness payloads exposed by the API. */
export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}

export interface ReadinessStatus {
  status: 'ready' | 'degraded';
  checks: Record<string, 'up' | 'down'>;
  timestamp: string;
}
