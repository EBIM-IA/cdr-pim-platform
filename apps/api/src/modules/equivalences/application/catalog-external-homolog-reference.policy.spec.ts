import { ValidationError, assertUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Product } from '../../catalog/domain/entities/product';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import { CatalogExternalHomologReferencePolicy } from './catalog-external-homolog-reference.policy';

function catalogueWith(brand: string | null) {
  const product = Product.create({
    sku: 'D1672',
    name: 'Pastilla de freno',
    brand,
    id: assertUuid('11111111-1111-4111-8111-111111111111'),
    now: new Date('2026-10-22T12:00:00Z'),
  });
  const repository: ProductRepositoryPort = {
    findById: vi.fn(async () => null),
    findBySku: vi.fn(async (sku) => (sku === product.sku ? product : null)),
    save: vi.fn(async () => undefined),
    list: vi.fn(async () => ({ items: [], total: 0 })),
  };
  return { repository, policy: new CatalogExternalHomologReferencePolicy(repository) };
}

describe('external homolog catalogue identity', () => {
  it('rejects an existing SKU of the same brand regardless of case and outer whitespace', async () => {
    const { policy } = catalogueWith(' Akebono ');

    await expect(policy.assertExternalReference(' d1672 ', 'AKEBONO')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('allows another brand to use the same external reference', async () => {
    const { policy } = catalogueWith('AKEBONO');

    await expect(policy.assertExternalReference('D1672', 'WAGNER')).resolves.toBeUndefined();
  });

  it('allows codes outside the catalogue without manufacturing a new product', async () => {
    const { policy, repository } = catalogueWith('AKEBONO');

    await expect(policy.assertExternalReference('QC1672', 'WAGNER')).resolves.toBeUndefined();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not assume that an unknown product brand matches an external brand', async () => {
    const { policy } = catalogueWith(null);

    await expect(policy.assertExternalReference('D1672', 'WAGNER')).resolves.toBeUndefined();
  });
});
