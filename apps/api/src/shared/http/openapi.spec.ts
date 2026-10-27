import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openApiSchema } from './openapi';

describe('native Zod OpenAPI conversion', () => {
  it('preserves input constraints and optional defaults without requiring response-only values', () => {
    const schema = z
      .object({
        sku: z.string().min(1).max(64),
        page: z.coerce.number().int().min(1).max(100).default(1),
        enabled: z.union([z.boolean(), z.literal('true').transform(() => true)]).default(false),
        values: z.record(z.string(), z.number()),
        note: z.string().nullable().optional(),
      })
      .strict();
    const converted = openApiSchema(schema);
    expect(converted).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['sku', 'values'],
      properties: {
        sku: { type: 'string', minLength: 1, maxLength: 64 },
        page: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
        values: { type: 'object', additionalProperties: { type: 'number' } },
        note: { type: 'string', nullable: true },
      },
    });
    expect(converted).not.toHaveProperty('$schema');
    expect(JSON.stringify(converted)).not.toContain('"$ref"');
    expect(schema.parse({ sku: '6205', values: { width: 15 } })).toMatchObject({
      page: 1,
      enabled: false,
    });
  });
});
