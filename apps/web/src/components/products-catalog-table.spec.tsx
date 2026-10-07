import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductsCatalog } from '@/components/products-catalog';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  downloadCsv: vi.fn(),
  downloadXlsx: vi.fn(),
  workbook: vi.fn(),
}));

const products: Product[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    sku: 'SKU-FAG',
    name: 'Rodamiento FAG',
    brand: 'FAG',
    brandFilter: 'FAG',
    category: 'Rodamientos',
    application: 'Industrial',
    status: 'draft',
    completeness: 70,
    unifiedCode: 'UNI-6205',
    attributes: [],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    sku: 'SKU-SKF',
    name: 'Rodamiento SKF',
    brand: 'SKF',
    brandFilter: 'SKF',
    category: 'Rodamientos',
    application: 'Automotriz',
    status: 'published',
    completeness: 95,
    providerCode: 'PROV-2',
    unifiedCode: 'UNI-6205',
    attributes: [],
  },
];

vi.mock('@/components/use-products-data', () => ({
  useProductsData: () => ({
    products,
    total: products.length,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('@/components/dynamic-catalog-sheet', () => ({
  DynamicCatalogSheet: () => <div>Hoja dinámica real</div>,
}));

vi.mock('@/components/catalog-workbook-table', () => ({
  CatalogWorkbookTable: (props: unknown) => {
    mocks.workbook(props);
    return <div>Tabla dinámica unificada</div>;
  },
}));

vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogCategories: async () => [
    {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'rodamientos',
      name: 'Rodamientos',
      path: 'Rodamientos',
      templateId: '44444444-4444-4444-8444-444444444444',
      templateName: 'Rodamientos',
      templateVersion: 1,
    },
  ],
}));

vi.mock('@/lib/tabular-export', () => ({
  downloadCsv: mocks.downloadCsv,
  downloadXlsx: mocks.downloadXlsx,
}));

afterEach(cleanup);

beforeEach(() => {
  mocks.downloadCsv.mockReset();
  mocks.downloadXlsx.mockReset();
  mocks.workbook.mockReset();
  window.history.replaceState({}, '', '/products');
});

describe('ProductsCatalog table view', () => {
  it('opens on the real unified workbook and forwards write capability', () => {
    render(<ProductsCatalog canEditAttributes />);

    expect(screen.getByText('Tabla dinámica unificada')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.workbook).toHaveBeenLastCalledWith(expect.objectContaining({ canEdit: true }));
  });

  it('keeps the dynamic catalog sheet as the real mass-editing surface', () => {
    render(<ProductsCatalog />);
    fireEvent.click(screen.getByRole('button', { name: /Actualización masiva/u }));

    expect(screen.getByText('Hoja dinámica real')).toBeVisible();
    expect(screen.getByText(/columnas, permisos y cambios provienen del backend/u)).toBeVisible();
  });
});
