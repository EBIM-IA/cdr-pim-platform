import { z, type ZodType } from 'zod';

/** Generates OpenAPI from the same Zod 4 schemas that validate incoming requests. */
export function openApiSchema(schema: ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    reused: 'inline',
  });
}
