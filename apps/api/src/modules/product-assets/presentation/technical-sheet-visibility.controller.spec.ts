import { describe, expect, it, vi } from 'vitest';
import { TechnicalSheetVisibilityController } from './technical-sheet-visibility.controller';
import type { TechnicalSheetVisibilityUseCase } from '../application/technical-sheet-visibility.use-case';

describe('Commercial sheet access projection', () => {
  it('preserves the saved flag while projecting actor access for bulk generation', async () => {
    const productId = '10000000-0000-4000-8000-000000000001';
    const useCase = {
      list: vi.fn().mockResolvedValue([{ productId, visible: false, version: 1 }]),
    } as unknown as TechnicalSheetVisibilityUseCase;
    const controller = new TechnicalSheetVisibilityController(useCase);
    for (const role of ['COMPRAS', 'VENTAS', 'ADMINISTRADOR'] as const) {
      expect(
        await controller.list(
          { productIds: [productId] },
          { id: role, email: 'review@example.test', roles: [role] },
        ),
      ).toEqual([{ productId, visible: false, version: 1, canView: role === 'ADMINISTRADOR' }]);
    }
  });
});
