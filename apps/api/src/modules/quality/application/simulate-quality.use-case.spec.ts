import { describe, expect, it, vi } from 'vitest';
import { newUuid } from '@cdr/shared';
import { SimulateQualityUseCase } from './simulate-quality.use-case';
import type { DynamicCatalogRepositoryPort } from '../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import type { ProductAssetRepositoryPort } from '../../product-assets/domain/ports/product-asset-repository.port';
import { Role } from '../../identity/domain/entities/role';
const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] },
  productId = newUuid();
function fixture() {
  const sheet = {
    schema: {
      attributes: [
        {
          key: 'zero',
          label: 'Cero',
          required: true,
          dataType: 'number',
          sourceAuthority: 'pim',
          permissions: { edit: true },
        },
        {
          key: 'enabled',
          label: 'Indicador',
          required: true,
          dataType: 'boolean',
          sourceAuthority: 'pim',
          permissions: { edit: true },
        },
        {
          key: 'erp',
          label: 'ERP',
          required: false,
          dataType: 'text',
          sourceAuthority: 'erp',
          permissions: { edit: false },
        },
      ],
    },
    product: { attributes: { zero: { value: 0 }, enabled: { value: false } } },
    assetRequirements: [{ type: 'FT', required: true }],
  };
  const catalog = { getProductSheet: vi.fn().mockResolvedValue(sheet) },
    assets = { listByProductId: vi.fn().mockResolvedValue([]) };
  return {
    sheet,
    catalog,
    service: new SimulateQualityUseCase(
      catalog as unknown as DynamicCatalogRepositoryPort,
      assets as unknown as ProductAssetRepositoryPort,
    ),
  };
}
describe('quality dry run', () => {
  it('counts zero and false, accepts hypothetical files, and leaves the persisted input untouched', async () => {
    const f = fixture(),
      before = JSON.stringify(f.sheet);
    expect(await f.service.execute({ productId, values: {}, assets: ['FT'] }, actor)).toMatchObject(
      {
        persisted: false,
        before: { required: 3, completed: 2, percentage: 67 },
        after: { required: 3, completed: 3, percentage: 100 },
      },
    );
    expect(JSON.stringify(f.sheet)).toBe(before);
  });
  it('validates types and refuses ERP or consultation writes even during a dry run', async () => {
    const f = fixture();
    await expect(f.service.execute({ productId, values: { zero: 'text' } }, actor)).rejects.toThrow(
      'definition',
    );
    await expect(
      f.service.execute({ productId, values: { erp: 'override' } }, actor),
    ).rejects.toThrow('ERP');
    await expect(
      f.service.execute({ productId, values: {} }, { ...actor, roles: [Role.Sales] }),
    ).rejects.toThrow('Administración');
  });
});
