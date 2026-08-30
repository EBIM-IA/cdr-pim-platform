import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import { ValidationError } from '@cdr/shared';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validates and *narrows* an inbound payload using the schema from `@cdr/contracts`.
 *
 * The contract package is the single source of truth shared by the API, the worker and
 * the web client; validating with the very same schema removes a whole class of
 * front-end/back-end drift bugs.
 */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, metadata: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new ValidationError(`Invalid ${metadata.type}`, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}
