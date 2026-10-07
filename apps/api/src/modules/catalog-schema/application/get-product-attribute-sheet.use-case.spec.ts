import { randomUUID } from 'node:crypto';

import type { Uuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import type { DynamicCatalogRepositoryPort } from '../domain/ports/dynamic-catalog.repository.port';
import { GetProductAttributeSheetUseCase } from './get-product-attribute-sheet.use-case';

const id = (): Uuid => randomUUID() as Uuid;

describe('GetProductAttributeSheetUseCase', () => {
  it('builds the commercial sheet on the backend from exportable attributes only', async () => {
    const productId = id();
    const exportedId = id();
    const internalId = id();
    const getProductSheet = vi.fn().mockResolvedValue({
      schema: {
        category: { id: id(), slug: 'rodamientos', name: 'Rodamientos' },
        template: { id: id(), name: 'Plantilla', version: 1 },
        attributes: [
          {
            id: exportedId,
            key: 'diametro',
            label: 'Diámetro',
            dataType: 'measurement',
            unit: 'mm',
            allowedValues: [],
            sourceAuthority: 'pim',
            required: false,
            replicable: true,
            searchable: true,
            includeInTechnicalSheet: true,
            position: 1,
            permissions: { edit: true, import: true, export: true },
          },
          {
            id: internalId,
            key: 'costo_interno',
            label: 'Costo interno',
            dataType: 'number',
            unit: null,
            allowedValues: [],
            sourceAuthority: 'erp',
            required: false,
            replicable: false,
            searchable: false,
            includeInTechnicalSheet: true,
            position: 2,
            permissions: { edit: false, import: false, export: false },
          },
        ],
      },
      product: {
        id: productId,
        sku: '6205',
        name: 'Rodamiento 6205',
        brand: 'FAG',
        status: 'published',
        attributes: {
          diametro: {
            value: 25,
            version: 1,
            source: 'manual',
            updatedAt: new Date('2026-10-07T12:00:00.000Z'),
          },
          costo_interno: {
            value: 99,
            version: 1,
            source: 'erp',
            updatedAt: new Date('2026-10-07T12:00:00.000Z'),
          },
        },
      },
    });
    const repository = { getProductSheet } as unknown as DynamicCatalogRepositoryPort;

    const result = await new GetProductAttributeSheetUseCase(repository).executeTechnicalSheet(
      productId,
    );

    expect(getProductSheet).toHaveBeenCalledWith(productId, ['ADMINISTRADOR', 'COMPRAS', 'VENTAS']);
    expect(result.schema.attributes.map((attribute) => attribute.key)).toEqual(['diametro']);
    expect(result.product.attributes).toEqual({ diametro: expect.any(Object) });
  });
});
