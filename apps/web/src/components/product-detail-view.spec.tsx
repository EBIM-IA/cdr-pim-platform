import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProduct } from '@/lib/catalog-api';
import { fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';
import { listApplications, listAuditChanges, listHomologs } from '@/lib/operational-api';
import type { Product } from '@/lib/types';

import { ProductDetailView } from './product-detail-view';

vi.mock('@/lib/catalog-api', () => ({
  CatalogApiError: class CatalogApiError extends Error {
    constructor(
      message: string,
      readonly status?: number,
    ) {
      super(message);
    }
  },
  fetchProduct: vi.fn(),
}));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  DynamicCatalogApiError: class DynamicCatalogApiError extends Error {
    constructor(
      message: string,
      readonly status?: number,
    ) {
      super(message);
    }
  },
  fetchProductAttributeSheet: vi.fn(),
}));
vi.mock('@/lib/operational-api', () => ({
  listApplications: vi.fn(),
  listAuditChanges: vi.fn(),
  listHomologs: vi.fn(),
}));

const product: Product = {
  id: '55555555-5555-4555-8555-555555555555',
  sku: 'D1672',
  name: 'Pastilla de freno D1672',
  brand: 'CDR',
  category: 'Categoría base',
  application: 'Aplicación base',
  status: 'published',
  completeness: null,
  queryChannel: 'API del catálogo',
  updatedAt: '2026-10-05T10:00:00.000Z',
  attributes: [
    {
      key: 'sku-0',
      label: 'SKU',
      value: 'D1672',
      rawValue: 'D1672',
    },
  ],
};

const sheet: ProductAttributeSheetDto = {
  schema: {
    category: {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'pastillas',
      name: 'Pastillas de freno',
    },
    template: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Plantilla pastillas',
      version: 1,
    },
    columns: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        key: 'codigo_unificador',
        label: 'Código unificador',
        dataType: 'text',
        unit: null,
        allowedValues: [],
        required: true,
        replicable: true,
        searchable: true,
        includeInTechnicalSheet: true,
        sourceAuthority: 'erp',
        position: 1,
        permissions: { edit: false, import: false, export: true },
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        key: 'descripcion_interna',
        label: 'Descripción interna',
        dataType: 'text',
        unit: null,
        allowedValues: [],
        required: false,
        replicable: false,
        searchable: true,
        includeInTechnicalSheet: false,
        sourceAuthority: 'pim',
        position: 2,
        permissions: { edit: false, import: false, export: false },
      },
    ],
  },
  product: {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    status: product.status,
    attributes: {
      codigo_unificador: {
        value: 'D1672',
        version: 1,
        source: 'erp',
        updatedAt: '2026-10-05T10:00:00.000Z',
      },
      descripcion_interna: {
        value: 'Pastilla cerámica',
        version: 1,
        source: 'manual',
        updatedAt: '2026-10-05T10:00:00.000Z',
      },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProduct).mockResolvedValue(product);
  vi.mocked(fetchProductAttributeSheet).mockResolvedValue(sheet);
  vi.mocked(listApplications).mockResolvedValue([
    {
      id: '66666666-6666-4666-8666-666666666666',
      groupId: '77777777-7777-4777-8777-777777777777',
      unifiedCode: 'D1672',
      vehicleType: 'Automóvil',
      make: 'Toyota',
      model: 'Hilux',
      yearFrom: 2016,
      yearTo: 2024,
      engine: '2.8',
      notes: null,
      active: true,
      source: 'manual',
      importBatchId: null,
      createdAt: '2026-10-05T10:00:00.000Z',
      updatedAt: '2026-10-05T10:00:00.000Z',
    },
  ]);
  vi.mocked(listHomologs).mockResolvedValue([]);
  vi.mocked(listAuditChanges).mockResolvedValue({
    items: [
      {
        id: '88888888-8888-4888-8888-888888888888',
        auditEntryId: '99999999-9999-4999-8999-999999999999',
        resourceType: 'product',
        resourceId: product.id,
        sku: product.sku,
        action: 'updated',
        field: 'descripcion_interna',
        before: 'Anterior',
        after: 'Pastilla cerámica',
        previousValueValidFrom: null,
        actorId: 'admin',
        source: 'api',
        correlationId: 'correlation-1',
        occurredAt: '2026-10-05T10:00:00.000Z',
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
  });
});

describe('ProductDetailView operational data', () => {
  it('loads the sheet, relations and audit, then renders real tab content', async () => {
    render(<ProductDetailView productId={product.id} />);

    expect(await screen.findByText('Pastilla cerámica')).toBeInTheDocument();
    expect(screen.getByText('Fuente: Manual')).toBeInTheDocument();
    expect(screen.getByText('Autoridad: PIM')).toBeInTheDocument();
    expect(screen.getByText('Solo detalle')).toBeInTheDocument();

    await waitFor(() => {
      expect(listApplications).toHaveBeenCalledWith(
        { unifiedCode: 'D1672' },
        expect.any(AbortSignal),
      );
      expect(listHomologs).toHaveBeenCalledWith({ unifiedCode: 'D1672' }, expect.any(AbortSignal));
      expect(listAuditChanges).toHaveBeenCalledWith(
        { resourceId: product.id, page: 1, pageSize: 100 },
        expect.any(AbortSignal),
      );
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Aplicaciones' }));
    expect(await screen.findByText('Toyota · Hilux')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(await screen.findByText('descripcion_interna')).toBeInTheDocument();
  });

  it('keeps the base ficha usable when no attribute sheet exists', async () => {
    const { DynamicCatalogApiError } = await import('@/lib/dynamic-catalog-api');
    vi.mocked(fetchProductAttributeSheet).mockRejectedValue(
      new DynamicCatalogApiError('Not found', 404),
    );

    render(<ProductDetailView productId={product.id} />);

    expect(await screen.findByRole('heading', { name: product.name })).toBeInTheDocument();
    expect(screen.getByText('SKU')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos mostrar esta ficha')).not.toBeInTheDocument();
  });
});
