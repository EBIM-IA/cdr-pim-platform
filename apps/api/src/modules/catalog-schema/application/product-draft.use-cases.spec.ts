import { ConflictError, FixedClock, ForbiddenError, newUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import type { DynamicCatalogRepositoryPort } from '../domain/ports/dynamic-catalog.repository.port';
import type { ProductDraftPort } from '../domain/ports/product-draft.port';
import { ProductDraftUseCases } from './product-draft.use-cases';

const productId = newUuid(),
  templateId = newUuid();
const actor: AuthenticatedActor = {
  id: 'admin',
  email: 'admin@example.test',
  roles: ['ADMINISTRADOR'],
};
const now = new Date('2026-11-10T15:00:00Z');
function setup() {
  const getProductSheet = vi.fn().mockResolvedValue({
    schema: {
      template: { id: templateId },
      attributes: [
        { key: 'material', sourceAuthority: 'pim', permissions: { edit: true } },
        { key: 'sku', sourceAuthority: 'erp', permissions: { edit: false } },
      ],
    },
    product: { id: productId },
  });
  const drafts: ProductDraftPort = {
    get: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockImplementation(async (input) => ({ ...input, version: input.version + 1 })),
  };
  const catalog = { getProductSheet } as unknown as DynamicCatalogRepositoryPort;
  return {
    drafts,
    catalog,
    useCases: new ProductDraftUseCases(drafts, catalog, new FixedClock(now)),
  };
}
describe('private product drafts', () => {
  it('saves unfinished text without applying attributes and scopes storage to the actor', async () => {
    const { drafts, catalog, useCases } = setup();
    const result = await useCases.save(
      productId,
      {
        templateId,
        expectedVersion: 3,
        entries: [{ attributeKey: 'material', draft: 'Sin terminar…', expectedVersion: 7 }],
      },
      actor,
    );
    expect(result.version).toBe(4);
    expect(drafts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        productId,
        actorId: actor.id,
        version: 3,
        entries: [{ attributeKey: 'material', draft: 'Sin terminar…', expectedVersion: 7 }],
      }),
      expect.objectContaining({ resourceType: 'product_draft', actorId: actor.id }),
    );
    expect(catalog.getProductSheet).toHaveBeenCalledWith(productId, ['ADMINISTRADOR']);
  });
  it('rejects ERP fields and outdated templates before persisting', async () => {
    const { drafts, useCases } = setup();
    await expect(
      useCases.save(
        productId,
        {
          templateId,
          expectedVersion: 0,
          entries: [{ attributeKey: 'sku', draft: 'OTRO', expectedVersion: 0 }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      useCases.save(productId, { templateId: newUuid(), expectedVersion: 0, entries: [] }, actor),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(drafts.save).not.toHaveBeenCalled();
  });
  it('filters values whose editing permission was revoked and cannot read another actor draft', async () => {
    const { drafts, useCases } = setup();
    vi.mocked(drafts.get).mockResolvedValue({
      productId,
      templateId,
      version: 2,
      updatedAt: now,
      entries: [
        { attributeKey: 'sku', draft: 'oculto', expectedVersion: 1 },
        { attributeKey: 'material', draft: 'acero', expectedVersion: 2 },
      ],
    });
    expect(
      (await useCases.get(productId, actor)).entries.map((entry) => entry.attributeKey),
    ).toEqual(['material']);
    expect(drafts.get).toHaveBeenCalledWith(productId, actor.id);
    await expect(useCases.get(productId, { ...actor, roles: ['VENTAS'] })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(drafts.get).toHaveBeenCalledTimes(1);
  });
});
