import { FixedClock, ForbiddenError, newUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { Role, type AuthenticatedActor } from '../../identity/domain/entities/role';
import {
  AttributeSourceAuthority,
  CatalogAttributeDataType,
} from '../domain/entities/catalog-schema';
import type { CatalogAdministrationRepositoryPort } from '../domain/ports/catalog-administration.repository.port';
import { UpdateTemplateAttributeUseCase } from './catalog-administration.use-cases';

const templateId = newUuid();
const definitionId = newUuid();
const now = new Date('2026-10-05T10:00:00.000Z');
const expectedUpdatedAt = '2026-10-04T10:00:00.000Z';

const purchasingActor: AuthenticatedActor = {
  id: 'buyer-1',
  email: 'compras@casadelruliman.com',
  roles: [Role.Purchasing],
};

const administratorActor: AuthenticatedActor = {
  id: 'admin-1',
  email: 'admin@casadelruliman.com',
  roles: [Role.Administrator],
};

const attribute = {
  id: definitionId,
  key: 'diametro_interior',
  label: 'Diámetro interior',
  dataType: CatalogAttributeDataType.Measurement,
  unit: 'mm',
  allowedValues: [],
  sourceAuthority: AttributeSourceAuthority.Pim,
  required: true,
  replicable: true,
  searchable: true,
  includeInTechnicalSheet: true,
  active: true,
  position: 0,
  updatedAt: now,
  roleAccess: [],
} as const;

function repository(): CatalogAdministrationRepositoryPort {
  return {
    listCategories: async () => [],
    updateCategory: async () => ({ kind: 'not_found' }),
    listTemplates: async () => [],
    getTemplate: async () => null,
    updateTemplateAttribute: vi.fn(async () => ({
      kind: 'updated' as const,
      before: attribute,
      after: attribute,
    })),
  };
}

describe('UpdateTemplateAttributeUseCase authorization', () => {
  it('allows COMPRAS to update ordinary template flags when roleAccess is omitted', async () => {
    const catalog = repository();
    const useCase = new UpdateTemplateAttributeUseCase(catalog, new FixedClock(now));

    await expect(
      useCase.execute(
        templateId,
        definitionId,
        { required: false, expectedUpdatedAt },
        purchasingActor,
      ),
    ).resolves.toEqual(attribute);

    expect(catalog.updateTemplateAttribute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId,
        attributeDefinitionId: definitionId,
        required: false,
      }),
    );
  });

  it('rejects COMPRAS roleAccess changes before invoking persistence', async () => {
    const catalog = repository();
    const useCase = new UpdateTemplateAttributeUseCase(catalog, new FixedClock(now));

    await expect(
      useCase.execute(
        templateId,
        definitionId,
        {
          expectedUpdatedAt,
          roleAccess: [
            {
              role: Role.Sales,
              canView: true,
              canEdit: false,
              canImport: false,
              canExport: true,
            },
          ],
        },
        purchasingActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(catalog.updateTemplateAttribute).not.toHaveBeenCalled();
  });

  it('allows ADMINISTRADOR to update roleAccess', async () => {
    const catalog = repository();
    const useCase = new UpdateTemplateAttributeUseCase(catalog, new FixedClock(now));
    const roleAccess = [
      {
        role: Role.Sales,
        canView: true,
        canEdit: false,
        canImport: false,
        canExport: true,
      },
    ] as const;

    await expect(
      useCase.execute(
        templateId,
        definitionId,
        { expectedUpdatedAt, roleAccess },
        administratorActor,
      ),
    ).resolves.toEqual(attribute);

    expect(catalog.updateTemplateAttribute).toHaveBeenCalledWith(
      expect.objectContaining({ roleAccess }),
    );
  });
});
