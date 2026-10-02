import { describe, expect, it } from 'vitest';

import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { Product } from '../domain/entities/product';
import { ListProductsUseCase } from './list-products.use-case';

const now = new Date('2026-10-01T12:00:00.000Z');

function product(sku: string, name: string, brand: string, description?: string) {
  return Product.create({ sku, name, brand, description, now });
}

describe('ListProductsUseCase', () => {
  it('filters by free text and brand before paginating', async () => {
    const repository = new InMemoryProductRepository([
      product('6205-2RS', 'Rodamiento rígido', 'SKF'),
      product('6206-2RS', 'Rodamiento rígido', 'FAG'),
      product('D1672', 'Pastilla de freno', 'Okami'),
    ]);
    const useCase = new ListProductsUseCase(repository);

    await expect(
      useCase.execute({ page: 1, pageSize: 10, q: 'rodamiento', brand: 'FAG' }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ sku: '6206-2RS' }],
    });
  });

  it('filters by lifecycle status', async () => {
    const draft = product('6205-2RS', 'Rodamiento', 'SKF');
    const published = product('D1672', 'Pastilla', 'Okami');
    published.describe('Lista para canal.', now);
    published.publish(now);
    const useCase = new ListProductsUseCase(new InMemoryProductRepository([draft, published]));

    await expect(
      useCase.execute({ page: 1, pageSize: 10, status: 'published' }),
    ).resolves.toMatchObject({ total: 1, items: [{ sku: 'D1672' }] });
  });

  it('includes the commercial description in free-text search', async () => {
    const useCase = new ListProductsUseCase(
      new InMemoryProductRepository([
        product('6205-2RS', 'Rodamiento', 'SKF', 'Sellado por ambos lados'),
        product('D1672', 'Pastilla', 'Okami', 'Compuesto cerámico'),
      ]),
    );

    await expect(useCase.execute({ page: 1, pageSize: 10, q: 'cerámico' })).resolves.toMatchObject({
      total: 1,
      items: [{ sku: 'D1672' }],
    });
  });
});
