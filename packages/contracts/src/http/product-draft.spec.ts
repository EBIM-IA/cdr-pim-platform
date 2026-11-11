import { describe, expect, it } from 'vitest';

import { saveProductDraftSchema } from './product-draft';
import { updateProductAttributesBatchSchema } from './dynamic-catalog';

const templateId = '11111111-1111-4111-8111-111111111111';
const entry = { attributeKey: 'material', draft: 'Acero', expectedVersion: 1 };
describe('product editing boundaries', () => {
  it('preserves unfinished draft text and rejects duplicate keys or database-invalid Unicode', () => {
    expect(
      saveProductDraftSchema.parse({
        templateId,
        expectedVersion: 0,
        entries: [{ ...entry, draft: '' }],
      }).entries[0]?.draft,
    ).toBe('');
    expect(
      saveProductDraftSchema.safeParse({ templateId, expectedVersion: 0, entries: [entry, entry] })
        .success,
    ).toBe(false);
    expect(
      saveProductDraftSchema.safeParse({
        templateId,
        expectedVersion: 0,
        entries: [{ ...entry, draft: '\u0000' }],
      }).success,
    ).toBe(false);
  });
  it('allows only draft and review destinations, keeping publication outside attribute editing', () => {
    const updates = [{ attributeKey: 'material', value: 'Acero', expectedVersion: 1 }];
    expect(
      updateProductAttributesBatchSchema.safeParse({
        updates,
        statusTarget: 'draft',
        reason: 'Revisión humana',
      }).success,
    ).toBe(true);
    expect(
      updateProductAttributesBatchSchema.safeParse({ updates, statusTarget: 'published' }).success,
    ).toBe(false);
    expect(
      updateProductAttributesBatchSchema.safeParse({ updates, reason: '\u0000' }).success,
    ).toBe(false);
  });
});
