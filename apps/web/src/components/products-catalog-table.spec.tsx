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
      templateVariantKey: '22.1',
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
    render(<ProductsCatalog canEditAttributes />);
    fireEvent.click(screen.getByRole('button', { name: /Actualización masiva/u }));

    expect(screen.getByText('Hoja dinámica real')).toBeVisible();
    expect(screen.getByText(/columnas, permisos y cambios provienen del backend/u)).toBeVisible();
  });

  it('removes sales-only product metadata and completeness controls from the UI', () => {
    render(
      <ProductsCatalog
        showProductStatus={false}
        showCompleteness={false}
        showTableDescriptionAndTemplate={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Filtros/u }));
    expect(screen.queryByRole('combobox', { name: 'Estado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Completitud' })).not.toBeInTheDocument();
    expect(mocks.workbook).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showStatus: false,
        showCompleteness: false,
        showDescriptionAndTemplate: false,
      }),
    );
  });

  it('collapses advanced filters without losing their values or active count', async () => {
    render(<ProductsCatalog />);

    const filtersButton = screen.getByRole('button', { name: /Filtros/u });
    expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'Marca' })).not.toBeInTheDocument();

    fireEvent.click(filtersButton);
    const brand = screen.getByRole('combobox', { name: 'Marca' });
    fireEvent.focus(brand);
    fireEvent.click(screen.getByRole('option', { name: 'FAG' }));

    expect(filtersButton).toHaveAccessibleName(/1 filtros activos/u);
    fireEvent.click(filtersButton);
    expect(screen.queryByRole('combobox', { name: 'Marca' })).not.toBeInTheDocument();

    fireEvent.click(filtersButton);
    expect(screen.getByRole('combobox', { name: 'Marca' })).toHaveValue('FAG');
  });

  it('forwards the persisted category id selected from the hierarchical control', async () => {
    render(<ProductsCatalog />);

    fireEvent.click(screen.getByRole('button', { name: /Filtros/u }));
    const category = await screen.findByRole('combobox', { name: 'Línea / categoría' });
    fireEvent.focus(category);
    fireEvent.click(screen.getByRole('button', { name: 'Rodamientos' }));

    expect(mocks.workbook).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: '33333333-3333-4333-8333-333333333333' }),
    );
  });

  it('keeps pagination available when a page-local catalog filter has no matches', () => {
    render(<ProductsCatalog />);

    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
    fireEvent.click(screen.getByRole('button', { name: /Frenos0/u }));

    expect(screen.getByText('Sin resultados para estos criterios')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Paginación del catálogo' })).toBeVisible();
  });

  it('preserves category identity for the backend table instead of filtering cards by name', async () => {
    render(<ProductsCatalog />);

    fireEvent.click(screen.getByRole('button', { name: /Filtros/u }));
    const category = await screen.findByRole('combobox', { name: 'Línea / categoría' });
    fireEvent.focus(category);
    fireEvent.click(screen.getByRole('button', { name: 'Rodamientos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));

    expect(screen.getByRole('combobox', { name: 'Línea / categoría' })).toBeDisabled();
    expect(screen.getByText('Categoría (Tabla): Rodamientos')).toBeVisible();
    expect(screen.getByText('SKU-FAG')).toBeVisible();
    expect(screen.getByText('SKU-SKF')).toBeVisible();
  });
});
