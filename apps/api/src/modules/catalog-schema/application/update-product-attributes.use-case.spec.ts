import { FixedClock, ValidationError, newUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  AttributeSourceAuthority,
  AttributeValueSource,
  CatalogAttributeDataType,
  type TemplateAttribute,
} from '../domain/entities/catalog-schema';
import type { DynamicCatalogRepositoryPort } from '../domain/ports/dynamic-catalog.repository.port';
import { UpdateProductAttributesUseCase } from './update-product-attributes.use-case';

const productId = newUuid();
const replicaId = newUuid();
const now = new Date('2026-10-07T10:00:00.000Z');
const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'compras@casadelruliman.com',
  roles: [Role.Purchasing],
};

function definition(key: string, dataType: CatalogAttributeDataType): TemplateAttribute {
  return {
    id: newUuid(),
    key,
    label: key,
    dataType,
    unit: null,
    allowedValues: [],
    sourceAuthority: AttributeSourceAuthority.Pim,
    required: false,
    replicable: true,
    searchable: true,
    includeInTechnicalSheet: true,
    position: 0,
    permissions: { edit: true, import: false, export: false },
  };
}

function repository(
  updateAttributes: DynamicCatalogRepositoryPort['updateAttributes'],
): DynamicCatalogRepositoryPort {
  const definitions = new Map([
    ['material', definition('material', CatalogAttributeDataType.Text)],
    ['diametro', definition('diametro', CatalogAttributeDataType.Measurement)],
  ]);
  return {
    findProductAttributeAssignment: async (_productId: string, key: string) => {
      const item = definitions.get(key);
      return item ? { productId, definition: item } : null;
    },
    updateAttributes,
  } as unknown as DynamicCatalogRepositoryPort;
}

describe('UpdateProductAttributesUseCase', () => {
  it('persists and reports a validated multi-attribute command as one batch', async () => {
    const updateAttributes = vi.fn<DynamicCatalogRepositoryPort['updateAttributes']>();
    updateAttributes.mockResolvedValue({
      kind: 'updated',
      updates: [
        {
          attributeKey: 'material',
          changes: [
            {
              productId,
              before: null,
              after: {
                value: 'Acero',
                version: 1,
                source: AttributeValueSource.Manual,
                updatedAt: now,
              },
            },
            {
              productId: replicaId,
              before: null,
              after: {
                value: 'Acero',
                version: 1,
                source: AttributeValueSource.Manual,
                updatedAt: now,
              },
            },
          ],
        },
        {
          attributeKey: 'diametro',
          changes: [
            {
              productId,
              before: null,
              after: { value: 25, version: 1, source: AttributeValueSource.Manual, updatedAt: now },
            },
          ],
        },
      ],
    });
    const useCase = new UpdateProductAttributesUseCase(
      repository(updateAttributes),
      new FixedClock(now),
    );

    await expect(
      useCase.execute(
        {
          productId,
          updates: [
            { attributeKey: 'material', value: 'Acero', expectedVersion: 0 },
            { attributeKey: 'diametro', value: 25, expectedVersion: 0 },
          ],
        },
        actor,
      ),
    ).resolves.toMatchObject({
      productId,
      attributes: [
        { attributeKey: 'material', version: 1, replicatedProductIds: [replicaId] },
        { attributeKey: 'diametro', version: 1, replicatedProductIds: [] },
      ],
    });
    expect(updateAttributes).toHaveBeenCalledOnce();
  });

  it('validates every value before asking persistence to mutate anything', async () => {
    const updateAttributes = vi.fn<DynamicCatalogRepositoryPort['updateAttributes']>();
    const useCase = new UpdateProductAttributesUseCase(
      repository(updateAttributes),
      new FixedClock(now),
    );

    await expect(
      useCase.execute(
        {
          productId,
          updates: [
            { attributeKey: 'material', value: 'Acero', expectedVersion: 0 },
            { attributeKey: 'diametro', value: 'no-es-numero', expectedVersion: 0 },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  it('identifies the conflicting field returned by the atomic repository operation', async () => {
    const useCase = new UpdateProductAttributesUseCase(
      repository(async () => ({
        kind: 'version_conflict',
        attributeKey: 'diametro',
        actualVersion: 3,
      })),
      new FixedClock(now),
    );

    await expect(
      useCase.execute(
        {
          productId,
          updates: [
            { attributeKey: 'material', value: 'Acero', expectedVersion: 0 },
            { attributeKey: 'diametro', value: 25, expectedVersion: 2 },
          ],
        },
        actor,
      ),
    ).rejects.toMatchObject({
      details: expect.objectContaining({ attributeKey: 'diametro', actualVersion: 3 }),
    });
  });
});
