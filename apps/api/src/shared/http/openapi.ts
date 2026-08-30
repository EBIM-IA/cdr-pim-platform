import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Bridges `@cdr/contracts` (Zod) into the OpenAPI document, so the published schema can
 * never drift from what the API actually validates and returns.
 */

// The library's own signature is a deeply conditional generic that TypeScript cannot
// instantiate for our larger schemas (TS2589). We only ever need the plain JSON Schema
// object out of it, so it is narrowed to that shape once, here.
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: ZodTypeAny,
  options: { target: 'openApi3'; $refStrategy: 'none' },
) => Record<string, unknown>;

export function openApiSchema(schema: ZodTypeAny): Record<string, unknown> {
  return toJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' });
}
