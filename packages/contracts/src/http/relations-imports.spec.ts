import { describe, expect, it } from 'vitest';

import { applicationListQuerySchema, previewImportSchema } from './index';

describe('relation and import contracts', () => {
  it('parses false query parameters without JavaScript truthiness surprises', () => {
    expect(applicationListQuerySchema.parse({ includeInactive: 'false' }).includeInactive).toBe(
      false,
    );
  });

  it('requires category scope for category imports', () => {
    expect(
      previewImportSchema.safeParse({
        target: 'category',
        format: 'json',
        idempotencyKey: 'batch-0001',
        records: [{ sku: 'D1672', material: 'ceramic' }],
      }).success,
    ).toBe(false);
  });
});
