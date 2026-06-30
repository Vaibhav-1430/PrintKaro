import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiSuccess } from '@print-karo/types';

/**
 * Wraps every successful response in the standard success envelope
 * (docs/api-specification.md §1.1).
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    const req = context.switchToHttp().getRequest<Request & { correlationId?: string }>();
    const correlationId = req.correlationId ?? 'unknown';

    // Better Auth owns its own response shape — do not wrap it.
    if (req.path?.startsWith('/api/auth')) {
      return next.handle() as Observable<ApiSuccess<T>>;
    }

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        meta: { correlationId },
      })),
    );
  }
}
