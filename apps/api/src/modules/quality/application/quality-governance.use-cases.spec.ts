import { describe, expect, it, vi } from 'vitest';
import { assertUuid } from '@cdr/shared';
import type { QualityReviewDto } from '@cdr/contracts';
import { QualityGovernanceUseCases } from './quality-governance.use-cases';
import type { QualityGovernancePort } from '../domain/ports/quality-governance.port';
import type { DynamicCatalogRepositoryPort } from '../../catalog-schema/domain/ports/dynamic-catalog.repository.port';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import type { CatalogAdministrationRepositoryPort } from '../../catalog-schema/domain/ports/catalog-administration.repository.port';
import { Role } from '../../identity/domain/entities/role';
const productId = assertUuid('10000000-0000-4000-8000-000000000001');
const id = assertUuid('20000000-0000-4000-8000-000000000001');
const now = new Date('2026-11-10T15:00:00Z');
const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };
const definition = {
  id,
  key: 'diametro',
  label: 'Diámetro',
  dataType: 'measurement',
  unit: 'mm',
  allowedValues: [],
  sourceAuthority: 'pim',
  required: false,
  replicable: false,
  searchable: false,
  includeInTechnicalSheet: true,
  position: 0,
  permissions: { edit: true, import: true, export: true },
};
function item(): QualityReviewDto {
  return {
    id,
    kind: 'attribute',
    productId,
    sku: 'SKU-1',
    attributeKey: 'diametro',
    currentValue: 10,
    attributeVersion: 3,
    candidates: [
      { source: 'fabricante', value: '25 mm', evidence: 'Ficha oficial', confidence: null },
      { source: 'archivo', value: 20, evidence: 'Ficha interna', confidence: null },
    ],
    proposedIndex: 0,
    chosenIndex: null,
    chosenValue: null,
    override: false,
    assetId: null,
    model: null,
    channel: null,
    productB: null,
    status: 'pending',
    duplicateDecision: null,
    reason: null,
    requestedBy: actor.email,
    decidedBy: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  };
}
function fixture() {
  const saved = item();
  const store = {
    find: vi.fn().mockResolvedValue(saved),
    decide: vi.fn(),
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    updatePriority: vi.fn(),
    productChanges: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    completeness: vi.fn().mockResolvedValue([]),
  };
  const catalog = {
    findProductAttributeAssignment: vi.fn().mockResolvedValue({ productId, definition }),
    getProductSheet: vi.fn().mockResolvedValue({
      schema: { category: { id }, attributes: [definition] },
      product: {
        id: productId,
        sku: 'SKU-1',
        attributes: { diametro: { value: 30, version: 4 } },
      },
    }),
  };
  const admin = {
    listCategories: vi
      .fn()
      .mockResolvedValue([{ id, sourcePriority: { fabricante: 1, archivo: 2 } }]),
  };
  const service = new QualityGovernanceUseCases(
    store as QualityGovernancePort,
    catalog as unknown as DynamicCatalogRepositoryPort,
    {} as ProductRepositoryPort,
    { now: () => now },
    { detect: async () => [] },
    admin as unknown as CatalogAdministrationRepositoryPort,
  );
  return { service, store, catalog, saved };
}
describe('Quality governance', () => {
  it('applies approved candidates and their decision through one atomic port, using the original attribute version', async () => {
    const { service, store } = fixture();
    const result = await service.decide(
      id,
      { version: 1, action: 'approve', chosenIndex: 0, reason: 'Validado contra ficha oficial.' },
      actor,
    );
    expect(result).toMatchObject({
      status: 'approved',
      chosenValue: 25,
      override: false,
      version: 2,
    });
    expect(store.decide).toHaveBeenCalledWith(
      expect.objectContaining({ id, status: 'approved' }),
      1,
      expect.objectContaining({
        changes: expect.objectContaining({ reason: { after: 'Validado contra ficha oficial.' } }),
      }),
      expect.objectContaining({ value: 25, expectedVersion: 3, productId }),
    );
  });
  it('records an alternative-source override with reason and preserves every candidate', async () => {
    const { service } = fixture();
    const result = await service.decide(
      id,
      {
        version: 1,
        action: 'approve',
        chosenIndex: 1,
        reason: 'El archivo corresponde a esta variante.',
      },
      actor,
    );
    expect(result.override).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.chosenValue).toBe(20);
  });
  it('persists rejections without applying any catalog mutation', async () => {
    const { service, store } = fixture();
    await service.decide(
      id,
      { version: 1, action: 'reject', reason: 'Evidencia no corresponde al artículo.' },
      actor,
    );
    expect(store.decide.mock.calls[0]?.[3]).toBeUndefined();
    expect(store.decide.mock.calls[0]?.[0]).toMatchObject({
      status: 'rejected',
      candidates: item().candidates,
    });
  });
  it('denies consultation roles, stale requests, ERP attributes and out-of-range candidates before mutation', async () => {
    const { service, store, catalog } = fixture();
    const input = { version: 1, action: 'approve' as const, reason: 'Verificado.' };
    await expect(
      service.decide(id, input, { ...actor, roles: [Role.Purchasing] }),
    ).rejects.toThrow();
    await expect(service.decide(id, { ...input, version: 2 }, actor)).rejects.toThrow();
    await expect(service.decide(id, { ...input, chosenIndex: 99 }, actor)).rejects.toThrow();
    catalog.findProductAttributeAssignment.mockResolvedValue({
      productId,
      definition: { ...definition, sourceAuthority: 'erp' },
    });
    await expect(service.decide(id, input, actor)).rejects.toThrow();
    expect(store.decide).not.toHaveBeenCalled();
  });
  it('preserves the baseline captured before the model call, including explicit empty values', async () => {
    const { service, store } = fixture();
    await service.captureExtraction(
      {
        productId,
        sku: 'SKU-1',
        assetId: id,
        filename: 'documento.pdf',
        model: 'simulado',
        candidates: [{ key: 'diametro', value: '20 mm', confidence: 0.9 }],
        baseline: { diametro: { value: null, version: 0 } },
      },
      actor,
    );
    expect(store.create.mock.calls[0]?.[0]?.[0]).toMatchObject({
      currentValue: null,
      attributeVersion: 0,
      assetId: id,
      status: 'pending',
    });
  });
  it('requires a human duplicate classification and keeps identities intact', async () => {
    const { service, saved, store } = fixture();
    saved.kind = 'duplicate';
    saved.productB = { id: productId, sku: 'SKU-2', name: 'Producto B', brand: null };
    await expect(
      service.decide(id, { version: 1, action: 'approve', reason: 'Revisado.' }, actor),
    ).rejects.toThrow();
    await service.decide(
      id,
      { version: 1, action: 'approve', reason: 'Revisado.', duplicateDecision: 'equivalent' },
      actor,
    );
    expect(store.decide.mock.calls[0]?.[3]).toBeUndefined();
    expect(store.decide.mock.calls[0]?.[0].productB?.sku).toBe('SKU-2');
  });
});
