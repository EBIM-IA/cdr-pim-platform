import { NotFoundError, ValidationError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { Product } from '../domain/entities/product';
import { GetProductByIdUseCase } from './get-product-by-id.use-case';

const now = new Date('2026-08-30T12:00:00.000Z');

describe('GetProductByIdUseCase', () => {
  it('returns the aggregate when it exists', async () => {
    const product = Product.create({ sku: '6205-2RS', name: 'Rodamiento', now });
    const useCase = new GetProductByIdUseCase(new InMemoryProductRepository([product]));

    expect((await useCase.execute(product.id)).sku).toBe('6205-2RS');
  });

  it('raises NotFoundError for an unknown id', async () => {
    const useCase = new GetProductByIdUseCase(new InMemoryProductRepository());
    await expect(useCase.execute('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects a malformed id before touching the repository', async () => {
    const useCase = new GetProductByIdUseCase(new InMemoryProductRepository());
    await expect(useCase.execute('not-a-uuid')).rejects.toBeInstanceOf(ValidationError);
  });
});
