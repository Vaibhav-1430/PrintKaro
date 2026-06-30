import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Ensures every request has a correlation id (ULID), echoed in the response,
 * so a request can be traced end-to-end across services and logs.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[CORRELATION_ID_HEADER];
    const correlationId = typeof incoming === 'string' && incoming.length > 0 ? incoming : ulid();
    (req as Request & { correlationId: string }).correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
