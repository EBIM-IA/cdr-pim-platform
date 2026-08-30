import { ValidationError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { ProductIdentifier, ProductIdentifierType } from './product-identifier';
import { Product, ProductStatus } from './product';

const now = new Date('2026-08-30T12:00:00.000Z');

function draft(overrides: Partial<{ sku: string; name: string; description: string | null }> = {}) {
  return Product.create({
    sku: overrides.sku ?? '6205-2rs',
    name: overrides.name ?? 'Rodamiento rígido de bolas 6205-2RS',
    description: overrides.description ?? null,
    brand: 'SKF',
    now,
  });
}

describe('Product', () => {
  it('normalises the SKU and starts in draft', () => {
    const product = draft();
    expect(product.sku).toBe('6205-2RS');
    expect(product.status).toBe(ProductStatus.Draft);
  });

  it('registers its own SKU as an identifier', () => {
    expect(draft().identifiers.map(String)).toContain('sku:6205-2RS');
  });

  it('rejects a blank SKU', () => {
    expect(() => draft({ sku: '   ' })).toThrow(ValidationError);
  });

  it('refuses to publish without a description', () => {
    const product = draft();
    expect(() => product.publish(now)).toThrow(/description/);

    product.describe('Rodamiento sellado por ambos lados, jaula de acero.', now);
    product.publish(now);
    expect(product.status).toBe(ProductStatus.Published);
  });

  it('refuses to publish an archived product', () => {
    const product = draft({ description: 'Sellado por ambos lados.' });
    product.archive(now);
    expect(() => product.publish(now)).toThrow(/archived/);
  });

  it('accepts several legacy codes but only one code per other type', () => {
    const product = draft();
    product.addIdentifier(
      ProductIdentifier.create(ProductIdentifierType.InternalLegacy, 'OLD-1'),
      now,
    );
    product.addIdentifier(
      ProductIdentifier.create(ProductIdentifierType.InternalLegacy, 'OLD-2'),
      now,
    );
    expect(product.identifiers).toHaveLength(3);

    product.addIdentifier(
      ProductIdentifier.create(ProductIdentifierType.Ean, '7501031311309'),
      now,
    );
    expect(() =>
      product.addIdentifier(
        ProductIdentifier.create(ProductIdentifierType.Ean, '7501031311316'),
        now,
      ),
    ).toThrow(/already has an identifier of this type/);
  });

  it('ignores an identifier it already carries', () => {
    const product = draft();
    const before = product.identifiers.length;
    product.addIdentifier(ProductIdentifier.create(ProductIdentifierType.Sku, '6205-2RS'), now);
    expect(product.identifiers).toHaveLength(before);
  });

  it('does not leak its internal identifier array', () => {
    const product = draft();
    (product.identifiers as ProductIdentifier[]).pop();
    expect(product.identifiers.length).toBeGreaterThan(0);
  });

  it('builds embeddable text from the fields that carry meaning', () => {
    const text = draft({ description: 'Sellado por ambos lados.' }).toEmbeddableText();
    expect(text).toContain('Rodamiento rígido de bolas 6205-2RS');
    expect(text).toContain('SKF');
    expect(text).toContain('Sellado por ambos lados.');
  });
});
