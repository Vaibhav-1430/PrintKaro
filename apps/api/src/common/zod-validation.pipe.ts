import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates and parses a request body/params against a Zod schema.
 * On failure throws a 400 with field-level details (mapped to the standard
 * error envelope by the global exception filter).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      throw new BadRequestException({ message: 'Validation failed', details });
    }
    return result.data;
  }
}
