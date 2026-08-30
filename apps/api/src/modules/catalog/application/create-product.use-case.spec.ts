import { ConflictError, FixedClock } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { CreateProductUseCase } from './create-product.use-case';

const clock = new FixedClock(new Date('2026-08-30T12:00:00.000Z'));

describe('CreateProductUseCase', () => {
  it('persists a new draft product', async () => {
    const repository = new InMemoryProductRepository();
    const useCase = new CreateProductUseCase(repository, clock);

    const product = await useCase.execute({ sku: '6205-2rs', name: 'Rodamiento' });

    expect(product.status).toBe('draft');
    expect(await repository.findBySku('6205-2RS')).not.toBeNull();
  });

  it('rejects a duplicate SKU regardless of casing', async () => {
    const repository = new InMemoryProductRepository();
    const useCase = new CreateProductUseCase(repository, clock);

    await useCase.execute({ sku: '6205-2RS', name: 'Rodamiento' });
    await expect(useCase.execute({ sku: '6205-2rs', name: 'Otro' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
