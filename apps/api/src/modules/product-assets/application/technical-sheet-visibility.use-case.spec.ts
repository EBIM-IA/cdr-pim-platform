import { describe, expect, it, vi } from 'vitest';
import { assertUuid, FixedClock, ForbiddenError } from '@cdr/shared';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import { TechnicalSheetVisibilityUseCase } from './technical-sheet-visibility.use-case';

describe('Technical sheet visibility authorization', () => {
  it('rejects a business consultation actor before any persistence', async () => {
    const get = vi.fn(),
      save = vi.fn();
    const products = { findById: vi.fn() } as unknown as ProductRepositoryPort;
    const service = new TechnicalSheetVisibilityUseCase(
      { get, save, getMany: vi.fn() },
      products,
      new FixedClock(new Date()),
    );
    await expect(
      service.update(
        assertUuid('10000000-0000-4000-8000-000000000001'),
        { visible: false, expectedVersion: 0 },
        { id: 'sales', email: 'sales@example.test', roles: ['VENTAS'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(save).not.toHaveBeenCalled();
    expect(products.findById).not.toHaveBeenCalled();
  });
});
