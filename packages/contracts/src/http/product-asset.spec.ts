import { describe, expect, it } from 'vitest';

import {
  productAssetBulkResultSchema,
  productAssetSelectorSchema,
  productAssetUploadMetadataSchema,
} from './product-asset';

describe('product asset HTTP contracts', () => {
  it('requires exactly one product selector', () => {
    const productId = '45d49ee2-45df-4c62-8cd4-e072e079cb4b';
    expect(productAssetSelectorSchema.safeParse({ productId }).success).toBe(true);
    expect(productAssetSelectorSchema.safeParse({ sku: '6205-2RS1' }).success).toBe(true);
    expect(productAssetSelectorSchema.safeParse({}).success).toBe(false);
    expect(productAssetSelectorSchema.safeParse({ productId, sku: '6205-2RS1' }).success).toBe(
      false,
    );
  });

  it('accepts only the document types agreed in the documents workflow', () => {
    expect(
      productAssetUploadMetadataSchema.safeParse({ sku: '6205-2RS1', type: 'FT' }).success,
    ).toBe(true);
    expect(
      productAssetUploadMetadataSchema.safeParse({ sku: '6205-2RS1', type: 'EXECUTABLE' }).success,
    ).toBe(false);
  });

  it('rejects a bulk response whose summary uses negative counts', () => {
    expect(
      productAssetBulkResultSchema.safeParse({
        mode: 'validate',
        archiveName: 'documentos.zip',
        total: -1,
        valid: 0,
        errors: 0,
        affectedSkus: 0,
        items: [],
      }).success,
    ).toBe(false);
  });
});
