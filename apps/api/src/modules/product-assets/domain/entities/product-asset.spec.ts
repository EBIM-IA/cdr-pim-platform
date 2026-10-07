import { describe, expect, it } from 'vitest';

import { buildProductAssetKey, validateAssetFile } from './product-asset';

const productId = '45d49ee2-45df-4c62-8cd4-e072e079cb4b' as never;
const assetId = 'afeb1bc0-acb7-4fce-bd8b-a5afc6314311' as never;

describe('product asset validation', () => {
  it('accepts a PDF only when name, MIME and signature agree', () => {
    const file = validateAssetFile({
      filename: '6205-2RS1__FT.pdf',
      declaredMimeType: 'application/pdf',
      content: new TextEncoder().encode('%PDF-1.7\nexample'),
      type: 'FT',
    });
    expect(file.mimeType).toBe('application/pdf');
    expect(file.extension).toBe('pdf');
  });

  it('rejects extension spoofing and unsafe names', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\nexample');
    expect(() =>
      validateAssetFile({
        filename: 'ficha.jpg',
        declaredMimeType: 'image/jpeg',
        content: pdf,
        type: 'FT',
      }),
    ).toThrow(/extension|MIME/);
    expect(() =>
      validateAssetFile({
        filename: '../ficha.pdf',
        declaredMimeType: 'application/pdf',
        content: pdf,
        type: 'FT',
      }),
    ).toThrow(/filename/);
  });

  it('does not allow a PDF in a photo slot', () => {
    expect(() =>
      validateAssetFile({
        filename: 'foto.pdf',
        declaredMimeType: 'application/pdf',
        content: new TextEncoder().encode('%PDF-1.7\nexample'),
        type: 'FOTO',
      }),
    ).toThrow(/not allowed/);
  });

  it('builds a canonical key without user-controlled path fragments', () => {
    expect(buildProductAssetKey({ productId, assetId, type: 'FT', extension: 'pdf' })).toBe(
      `products/${productId}/documents/${assetId}.pdf`,
    );
  });
});
