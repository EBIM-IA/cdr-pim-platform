import { ConflictError, FixedClock, ForbiddenError, newUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  AttributeSourceAuthority,
  AttributeValueSource,
  CatalogAttributeDataType,
} from '../domain/entities/catalog-schema';
import type { DynamicCatalogRepositoryPort } from '../domain/ports/dynamic-catalog.repository.port';
import { UpdateProductAttributeUseCase } from './update-product-attribute.use-case';

const productId = newUuid();
const replicaId = newUuid();
const definitionId = newUuid();
const now = new Date('2026-10-05T10:00:00.000Z');
const actor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'compras@casadelruliman.com',
  roles: [Role.Purchasing],
};

function repository(
  result: Awaited<ReturnType<DynamicCatalogRepositoryPort['updateAttribute']>>,
  sourceAuthority: AttributeSourceAuthority = AttributeSourceAuthority.Pim,
): DynamicCatalogRepositoryPort {
  return {
    listActiveCategories: async () => [],
    getActiveSchema: async () => null,
    getProductSheet: async () => null,
    listGrid: async () => ({ items: [], total: 0 }),
    findProductAttributeAssignment: async () => ({
      productId,
      definition: {
        id: definitionId,
        key: 'diametro_interior',
        label: 'Diámetro interior',
        dataType: CatalogAttributeDataType.Measurement,
        unit: 'mm',
        allowedValues: [],
        sourceAuthority,
        required: true,
        replicable: true,
        searchable: true,
        includeInTechnicalSheet: true,
        position: 0,
        permissions: { edit: true, import: true, export: true },
      },
    }),
    updateAttribute: async (input) => {
      expect(input.source).toBe(AttributeValueSource.Manual);
      expect(input.audit.actorId).toBe(actor.id);
      return result;
    },
  };
}

describe('UpdateProductAttributeUseCase', () => {
  it('delegates one atomic manual update for the product and its codigoUnificador replicas', async () => {
    const useCase = new UpdateProductAttributeUseCase(
      repository({
        kind: 'updated',
        changes: [productId, replicaId].map((id) => ({
          productId: id,
          before: null,
          after: { value: 25, version: 1, source: AttributeValueSource.Manual, updatedAt: now },
        })),
      }),
      new FixedClock(now),
    );

    await expect(
      useCase.execute(
        {
          productId,
          attributeKey: 'diametro_interior',
          value: 25,
          expectedVersion: 0,
        },
        actor,
      ),
    ).resolves.toMatchObject({ version: 1, replicatedProductIds: [replicaId] });
  });

  it('reports optimistic concurrency conflicts', async () => {
    const useCase = new UpdateProductAttributeUseCase(
      repository({ kind: 'version_conflict', actualVersion: 3 }),
      new FixedClock(now),
    );
    await expect(
      useCase.execute(
        {
          productId,
          attributeKey: 'diametro_interior',
          value: 25,
          expectedVersion: 2,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects human edits to ERP-authoritative attributes', async () => {
    const useCase = new UpdateProductAttributeUseCase(
      repository({ kind: 'not_found' }, AttributeSourceAuthority.Erp),
      new FixedClock(now),
    );
    await expect(
      useCase.execute(
        { productId, attributeKey: 'diametro_interior', value: 25, expectedVersion: 0 },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
