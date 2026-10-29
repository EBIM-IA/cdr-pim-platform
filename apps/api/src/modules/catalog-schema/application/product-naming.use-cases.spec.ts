import type { ProductNameConfig } from '@cdr/contracts';
import { ConflictError, FixedClock, NotFoundError, assertUuid, newUuid } from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';

import { GroupApplication } from '../../applications/domain/entities/group-application';
import type { GroupApplicationRepositoryPort } from '../../applications/domain/ports/group-application-repository.port';
import { Product } from '../../catalog/domain/entities/product';
import type { ProductRepositoryPort } from '../../catalog/domain/ports/product-repository.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import type { CatalogWorkbookProduct, TemplateAttribute } from '../domain/entities/catalog-schema';
import type { DynamicCatalogRepositoryPort } from '../domain/ports/dynamic-catalog.repository.port';
import type { ProductNameSettingsPort } from '../domain/ports/product-name-settings.port';
import { DEFAULT_PRODUCT_NAME_CONFIG } from '../domain/services/product-naming';
import { ProductNamingUseCases } from './product-naming.use-cases';

const now = new Date('2026-10-28T12:00:00.000Z');
const productId = newUuid(),
  categoryId = newUuid(),
  templateId = newUuid();
const actor: AuthenticatedActor = {
  id: 'sales-1',
  email: 'sales@example.test',
  roles: ['VIEWER', 'VENTAS'],
};
const column = (key: string): TemplateAttribute => ({
  id: newUuid(),
  key,
  label: key,
  dataType: 'text',
  unit: null,
  allowedValues: [],
  sourceAuthority: 'pim',
  required: false,
  replicable: false,
  searchable: true,
  includeInTechnicalSheet: true,
  position: 1,
  permissions: { edit: false, import: false, export: false },
});
const cell = (value: string) => ({ value, version: 1, source: 'manual' as const, updatedAt: now });
const application = (model = 'COROLLA', vehicleType = 'AUTOMOTRIZ'): GroupApplication =>
  GroupApplication.create(
    { groupId: newUuid(), unifiedCode: '6205', vehicleType, make: 'TOYOTA', model },
    now,
  );

function fixture() {
  const product = Product.create({
    id: productId,
    sku: '6205-2RS1',
    name: 'ERP',
    brand: 'SKF',
    now,
  });
  const categories = [
    {
      id: categoryId,
      slug: 'rigido',
      name: 'Rígido',
      path: '/rodamientos/bolas/rigido',
      templateId,
      templateVariantKey: 'default',
      templateName: 'Plantilla',
      templateVersion: 1,
      ancestors: [
        { id: newUuid(), slug: 'rodamientos', name: 'Rodamientos y afines', path: '/rodamientos' },
        { id: newUuid(), slug: 'bolas', name: 'Rodamiento de bolas', path: '/rodamientos/bolas' },
      ],
    },
  ];
  const get = vi
    .fn()
    .mockResolvedValue({ config: structuredClone(DEFAULT_PRODUCT_NAME_CONFIG), version: 0 });
  const save = vi
    .fn()
    .mockImplementation(async (input) => ({ ...input, version: input.version + 1 }));
  const settings = { get, save } as ProductNameSettingsPort;
  const getProductSheet = vi.fn().mockResolvedValue({
    schema: {
      category: { id: categoryId, name: 'Rígido', slug: 'rigido' },
      template: { id: templateId, variantKey: 'default', name: 'Plantilla', version: 1 },
      attributes: [column('visible')],
    },
    product: {
      id: productId,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      status: product.status,
      attributes: { visible: cell('VISIBLE'), hidden: cell('SECRETO') },
    },
  });
  const listWorkbook = vi.fn().mockResolvedValue({
    columns: [column('visible')],
    items: [],
    total: 0,
    facets: { brands: [], applicationTypes: [], statuses: [] },
  });
  const listActiveCategories = vi.fn().mockResolvedValue(categories);
  const catalog = {
    getProductSheet,
    listWorkbook,
    listActiveCategories,
  } as unknown as DynamicCatalogRepositoryPort;
  const list = vi.fn().mockResolvedValue([application()]);
  const listForProducts = vi
    .fn()
    .mockResolvedValue(new Map([[productId, [application(), application('HILUX')]]]));
  const applications = { list, listForProducts } as unknown as GroupApplicationRepositoryPort;
  const findById = vi.fn().mockResolvedValue(product);
  const findBySku = vi.fn().mockResolvedValue(null);
  const products = { findById, findBySku } as unknown as ProductRepositoryPort;
  const useCases = new ProductNamingUseCases(
    settings,
    catalog,
    applications,
    products,
    new FixedClock(now),
  );
  return {
    useCases,
    get,
    save,
    findById,
    findBySku,
    getProductSheet,
    listWorkbook,
    listActiveCategories,
    list,
    listForProducts,
  };
}

const draft = (): ProductNameConfig => ({
  ...structuredClone(DEFAULT_PRODUCT_NAME_CONFIG),
  automotive: [
    { field: 'attribute:hidden', before: 'SECRETO', after: 'FIN', format: 'original' },
    { field: 'attribute:visible', before: '', after: '', format: 'original' },
  ],
});

function workbookItem(overrides: Partial<CatalogWorkbookProduct> = {}): CatalogWorkbookProduct {
  return {
    id: productId,
    sku: '6205-2RS1',
    name: 'ERP',
    description: null,
    brand: 'SKF',
    status: 'draft',
    updatedAt: now,
    category: { id: categoryId, name: 'Rígido' },
    template: { id: templateId, variantKey: 'default', name: 'Plantilla', version: 1 },
    providerCode: '6205-2RS',
    unifiedCode: '6205',
    applicationTypes: ['AUTOMOTRIZ', 'INDUSTRIAL'],
    completeness: null,
    attributes: {
      visible: {
        ...cell('VISIBLE'),
        applicable: true,
        required: false,
        permissions: { edit: false, export: false },
      },
      hidden: {
        ...cell('SECRETO'),
        applicable: true,
        required: false,
        permissions: { edit: false, export: false },
      },
    },
    ...overrides,
  };
}

describe('ProductNamingUseCases', () => {
  it('uses authorized tree names over stale ERP category text, and normalizes legacy roles', async () => {
    const f = fixture();
    const result = await f.useCases.experience(productId, actor);
    expect(result.nombreGeneral).toContain('Rodamiento de bolas rígido');
    expect(f.getProductSheet).toHaveBeenCalledWith(productId, ['VENTAS']);
    expect(f.listActiveCategories).toHaveBeenCalledWith(['VENTAS']);
  });

  it('cannot interpolate or expose a field absent from the actor-visible schema', async () => {
    const f = fixture();
    const result = await f.useCases.experience(productId, actor, draft());
    expect(result.nombreGeneral).toBe('VISIBLE');
    expect(result.fields.some((field) => field.field.includes('hidden'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('SECRETO');
    expect(f.save).not.toHaveBeenCalled();
  });

  it('includes the visible union of template fields during preview without using other products values', async () => {
    const f = fixture();
    f.listWorkbook.mockResolvedValue({ columns: [column('other_template')], items: [], total: 0 });
    const result = await f.useCases.experience(productId, actor, draft());
    expect(result.fields.some((field) => field.field === 'attribute:other_template')).toBe(true);
    expect(result.nombreGeneral).toBe('VISIBLE');
  });

  it('classifies an industrial compatibility row even when no visible ERP type is populated', async () => {
    const f = fixture();
    f.list.mockResolvedValue([application('BOMBA', 'INDUSTRIAL')]);
    const result = await f.useCases.experience(productId, actor);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]).toMatchObject({ tipo: 'industrial', aplicacion: null });
  });

  it('rejects malformed ids before querying and reports a missing product', async () => {
    const f = fixture();
    await expect(f.useCases.experience('bad-id', actor)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(f.findById).not.toHaveBeenCalled();
    f.findById.mockResolvedValue(null);
    await expect(f.useCases.experience(productId, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('persists the before/after formulas, principal, time, and optimistic version through one port call', async () => {
    const f = fixture();
    const input = { config: draft(), version: 0 };
    await expect(f.useCases.saveSettings(input, actor)).resolves.toMatchObject({ version: 1 });
    expect(f.save).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        resourceType: 'product_name_settings',
        resourceId: 'product-name',
        action: 'updated',
        actorId: actor.id,
        occurredAt: now,
        changes: { nombre_amigable: { before: DEFAULT_PRODUCT_NAME_CONFIG, after: input.config } },
      }),
    );
  });

  it('rejects a stale version before creating an inaccurate audit event', async () => {
    const f = fixture();
    f.get.mockResolvedValue({ config: DEFAULT_PRODUCT_NAME_CONFIG, version: 2 });
    await expect(
      f.useCases.saveSettings({ config: draft(), version: 1 }, actor),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(f.save).not.toHaveBeenCalled();
  });

  it('loads search contexts in bulk and filters only the selected vehicle without leaking hidden values', async () => {
    const f = fixture();
    f.listWorkbook.mockResolvedValue({
      columns: [column('visible')],
      items: [workbookItem()],
      total: 1,
    });
    const result = await f.useCases.search({ q: 'rodamiento corolla', limit: 12 }, actor);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.aplicacion?.modelo).toBe('COROLLA');
    expect(result.items[0]?.nombreAmigable).toContain('Rodamiento de bolas rígido');
    expect(f.listForProducts).toHaveBeenCalledExactlyOnceWith([productId]);
    expect(f.get).toHaveBeenCalledOnce();
    expect(f.getProductSheet).not.toHaveBeenCalled();
    expect(f.findById).not.toHaveBeenCalled();
    expect(f.list).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('SECRETO');
    expect(result.truncated).toBe(false);
  });

  it('includes an exact SKU outside the bounded candidate page and ranks it first', async () => {
    const f = fixture();
    const exactId = newUuid();
    const exact = Product.create({ id: exactId, sku: '6205', name: 'Exacto', brand: 'SKF', now });
    f.findBySku.mockResolvedValue(exact);
    f.listWorkbook.mockResolvedValue({ columns: [], items: [workbookItem()], total: 150 });
    const result = await f.useCases.search({ q: '6205', limit: 12 }, actor);
    expect(result.items[0]?.productId).toBe(exactId);
    expect(f.getProductSheet).toHaveBeenCalledExactlyOnceWith(exactId, ['VENTAS']);
    expect(f.listForProducts).toHaveBeenCalledExactlyOnceWith([productId, exactId]);
    expect(f.findBySku).toHaveBeenCalledExactlyOnceWith('6205');
  });

  it('applies the same role-filtered field whitelist to an exact SKU outside the first candidate page', async () => {
    const f = fixture();
    const exactId = newUuid();
    f.findBySku.mockResolvedValue(
      Product.create({ id: exactId, sku: '6205', name: 'Exacto', brand: 'SKF', now }),
    );
    f.get.mockResolvedValue({ config: draft(), version: 1 });
    f.listWorkbook.mockResolvedValue({ columns: [], items: [], total: 150 });
    const result = await f.useCases.search({ q: '6205', limit: 12 }, actor);
    expect(result.items).toMatchObject([{ productId: exactId, nombreAmigable: 'VISIBLE' }]);
    expect(JSON.stringify(result)).not.toContain('SECRETO');
    expect(f.getProductSheet).toHaveBeenCalledExactlyOnceWith(exactId, ['VENTAS']);
  });

  it('uses one bulk read per source for 100 candidates and thousands of variants', async () => {
    const f = fixture();
    const items = Array.from({ length: 100 }, (_, index) =>
      workbookItem({ id: newUuid(), sku: `SKU-${index}` }),
    );
    const applications = Array.from({ length: 40 }, (_, index) => application(`MODELO-${index}`));
    f.listWorkbook.mockResolvedValue({ columns: [], items, total: 100 });
    f.listForProducts.mockResolvedValue(new Map(items.map((item) => [item.id, applications])));
    const result = await f.useCases.search({ q: 'rodamiento', limit: 12 }, actor);
    expect(result.items).toHaveLength(12);
    expect(result.truncated).toBe(true);
    for (const read of [
      f.listWorkbook,
      f.get,
      f.listActiveCategories,
      f.listForProducts,
      f.findBySku,
    ])
      expect(read).toHaveBeenCalledOnce();
    for (const read of [f.findById, f.getProductSheet, f.list]) expect(read).not.toHaveBeenCalled();
  });

  it('filters combined vehicle and fuel terms against the same active application', async () => {
    const f = fixture();
    f.listWorkbook.mockResolvedValue({ columns: [], items: [workbookItem()], total: 1 });
    const gasoline = application('COROLLA'),
      diesel = application('HILUX');
    gasoline.update({ fuel: 'GASOLINA' }, now);
    diesel.update({ fuel: 'DIÉSEL' }, now);
    f.listForProducts.mockResolvedValue(new Map([[productId, [gasoline, diesel]]]));
    const result = await f.useCases.search({ q: 'corolla diesel', limit: 12 }, actor);
    expect(result.items).toEqual([]);
  });

  it('reports truncated variants and bounded candidate pages while preserving facets', async () => {
    const f = fixture();
    f.listWorkbook.mockResolvedValue({ columns: [], items: [workbookItem()], total: 105 });
    const result = await f.useCases.search({ q: '6205 skf', limit: 1 }, actor);
    expect(result).toMatchObject({
      totalProducts: 105,
      brands: ['SKF'],
      categories: [{ id: categoryId, name: 'Rígido' }],
      truncated: true,
    });
    expect(result.items).toHaveLength(1);
    expect(f.listWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 100, q: '6205 skf', roles: ['VENTAS'] }),
    );
  });

  it('preserves all automotive/industrial variants for a general match and selects none from unrelated products', async () => {
    const f = fixture();
    f.listWorkbook.mockResolvedValue({ columns: [], items: [workbookItem()], total: 1 });
    const result = await f.useCases.search({ q: '6205', limit: 12 }, actor);
    expect(result.items.map((v) => v.tipo)).toEqual(['automotriz', 'automotriz', 'industrial']);
    expect(result.items.every((v) => v.productId === assertUuid(productId))).toBe(true);
  });
});
