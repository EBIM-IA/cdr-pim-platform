import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { paginationQuerySchema, apiErrorSchema } from './common';
import { updateProductAttributesBatchSchema } from './dynamic-catalog';
import { axSyncRequestSchema } from './ax-integration';

describe('Zod security and contract compatibility', () => {
  it('rejects oversized attribute batches before reading any element', () => {
    const read = vi.fn(() => {
      throw new Error('Oversized elements must not be inspected');
    });
    const element = Object.defineProperty({}, 'attributeKey', { enumerable: true, get: read });
    const result = updateProductAttributesBatchSchema.safeParse({
      updates: Array(101).fill(element),
    });
    expect(result.success).toBe(false);
    expect(read).not.toHaveBeenCalled();
    if (!result.success)
      expect(result.error.issues).toEqual([
        expect.objectContaining({ code: 'too_big', path: ['updates'], maximum: 100 }),
      ]);
  });

  it.each(['max', 'length'] as const)(
    'checks array %s before parsing or refining invalid elements',
    (bound) => {
      const validate = vi.fn(() => false);
      const result = z.array(z.string().refine(validate))[bound](2).safeParse(['a', 'b', 'c']);
      expect(result.success).toBe(false);
      expect(validate).not.toHaveBeenCalled();
      if (!result.success) expect(result.error.issues).toHaveLength(1);
    },
  );

  it('keeps query coercion/defaults, explicit record values, and strict AX fields', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '50', ignored: 'value' })).toEqual({
      page: 2,
      pageSize: 50,
    });
    expect(
      apiErrorSchema.shape.error.shape.details.parse({ nested: { anything: ['ok'] }, count: 2 }),
    ).toEqual({ nested: { anything: ['ok'] }, count: 2 });
    const payload = {
      idLote: 'L-1',
      fechaEnvio: '2026-10-27T10:00:00Z',
      productos: [{ codigoArticulo: 'SKU', codigoProveedor: 'P', codigoLinea: 'L' }],
    };
    expect(axSyncRequestSchema.parse(payload)).toEqual(payload);
    expect(axSyncRequestSchema.safeParse({ ...payload, extra: true }).success).toBe(false);
  });
});
