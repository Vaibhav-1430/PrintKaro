import { Body } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

/** @ZodBody(schema) — validates the request body against a Zod schema. */
export function ZodBody<T>(schema: ZodSchema<T>): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}
