import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ApiError, type ApiErrorDetail, type ErrorCode } from '@print-karo/types';

/**
 * Global exception filter — converts any thrown error into the standard
 * error envelope. Never leaks stack traces to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId = req.correlationId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ERROR_CODES.INTERNAL_ERROR;
    let message = 'Internal server error';
    let details: ApiErrorDetail[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else {
        const r = response as { message?: string | string[]; details?: ApiErrorDetail[] };
        message = Array.isArray(r.message)
          ? (r.message[0] ?? exception.message)
          : (r.message ?? exception.message);
        if (r.details) details = r.details;
      }
      code = this.mapStatusToCode(status);
    }

    if (status >= 500) {
      this.logger.error(`[${correlationId}] ${String(exception)}`);
    }

    const body: ApiError = {
      success: false,
      error: { code, message, correlationId, ...(details ? { details } : {}) },
    };

    res.status(status).json(body);
  }

  private mapStatusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.IDEMPOTENCY_CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}
