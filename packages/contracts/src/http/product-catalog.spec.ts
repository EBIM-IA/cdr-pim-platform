import { describe, expect, it } from 'vitest';

import {
  productCatalogCreateSchema,
  productCatalogListQuerySchema,
  productCatalogShareCreateSchema,
  productCatalogSharedRequestSchema,
  productCatalogUpdateSchema,
} from './product-catalog';

const metadata = {
  title: 'Catálogo de prueba',
  description: '',
  validFrom: '2026-10-23',
  validUntil: null,
};

describe('product catalog contracts', () => {
  it('validates real calendar dates and an inclusive ordered validity range', () => {
    expect(productCatalogCreateSchema.parse(metadata)).toEqual(metadata);
    expect(
      productCatalogCreateSchema.safeParse({ ...metadata, validFrom: '0000-01-01' }).success,
    ).toBe(false);
    expect(productCatalogCreateSchema.parse({ ...metadata, validUntil: '' }).validUntil).toBeNull();
    expect(
      productCatalogCreateSchema.safeParse({ ...metadata, validFrom: '2026-02-30' }).success,
    ).toBe(false);
    expect(
      productCatalogCreateSchema.safeParse({ ...metadata, validUntil: '2026-10-22' }).success,
    ).toBe(false);
    expect(
      productCatalogCreateSchema.safeParse({ ...metadata, validUntil: '2026-10-23' }).success,
    ).toBe(true);
  });
  it('requires a concurrency version for editing and limits metadata', () => {
    expect(productCatalogUpdateSchema.safeParse(metadata).success).toBe(false);
    expect(
      productCatalogUpdateSchema.safeParse({
        ...metadata,
        expectedUpdatedAt: '2026-10-23T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      productCatalogCreateSchema.safeParse({ ...metadata, title: ' '.repeat(10) }).success,
    ).toBe(false);
    expect(
      productCatalogCreateSchema.safeParse({ ...metadata, title: 'x'.repeat(121) }).success,
    ).toBe(false);
    expect(
      productCatalogCreateSchema.safeParse({ ...metadata, description: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
  it('accepts only bounded pagination, explicit deleted flags and known sharing terms', () => {
    expect(productCatalogListQuerySchema.parse({ includeDeleted: 'false' }).includeDeleted).toBe(
      false,
    );
    expect(productCatalogListQuerySchema.parse({ includeDeleted: 'true' }).includeDeleted).toBe(
      true,
    );
    expect(productCatalogListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(productCatalogListQuerySchema.safeParse({ includeDeleted: 'yes' }).success).toBe(false);
    expect(
      productCatalogShareCreateSchema.safeParse({
        term: 'forever',
        expectedUpdatedAt: '2026-10-23T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
  it('keeps anonymous requests to a single fixed-format token', () => {
    const token = 'A'.repeat(43);
    expect(productCatalogSharedRequestSchema.parse({ token })).toEqual({ token });
    expect(productCatalogSharedRequestSchema.safeParse({ token: '../private' }).success).toBe(
      false,
    );
    expect(
      productCatalogSharedRequestSchema.safeParse({ token, catalogId: 'another-record' }).success,
    ).toBe(false);
  });
});
