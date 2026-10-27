import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductsCatalog } from '@/components/products-catalog';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  downloadCsv: vi.fn(),
  downloadXlsx: vi.fn(),
  workbook: vi.fn(),
  fetchWorkbook: vi.fn(),
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
  fetchCatalogWorkbook: mocks.fetchWorkbook,
  fetchCatalogCategories: async () => [
    {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'rodamientos',
      name: 'Rodamientos',
      path: 'Catálogo industrial > Rodamientos',
      ancestors: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          slug: 'catalogo-industrial',
          name: 'Catálogo industrial',
          path: 'Catálogo industrial',
        },
      ],
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
  mocks.fetchWorkbook.mockReset();
  mocks.fetchWorkbook.mockResolvedValue({
    columns: [],
    items: products.map((product) => ({
      ...product,
      description: null,
      category: { id: '33333333-3333-4333-8333-333333333333', name: product.category },
      template: {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Rodamientos',
        variantKey: '22.1',
        version: 1,
      },
      applicationTypes: [product.application === 'Industrial' ? 'INDUSTRIAL' : 'AUTOMOTRIZ'],
      providerCode: product.providerCode ?? null,
      unifiedCode: product.unifiedCode ?? null,
      attributes: {},
      updatedAt: '2026-10-22T10:00:00.000Z',
    })),
    facets: {
      brands: ['FAG', 'SKF'],
      applicationTypes: ['INDUSTRIAL', 'AUTOMOTRIZ'],
      statuses: ['draft', 'published'],
    },
    total: products.length,
    page: 1,
    pageSize: 25,
  });
  window.history.replaceState({}, '', '/products');
});

describe('ProductsCatalog table view', () => {
  it('opens the reference catalog list and forwards write capability to the table', async () => {
    render(<ProductsCatalog canEditAttributes />);

    expect(await screen.findByText('SKU-FAG')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Catálogo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(screen.getByText('Tabla dinámica unificada')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.workbook).toHaveBeenLastCalledWith(expect.objectContaining({ canEdit: true }));
  });

  it('keeps the dynamic catalog sheet as the real mass-editing surface', () => {
    render(<ProductsCatalog canEditAttributes />);
    fireEvent.click(screen.getByRole('button', { name: /Actualización masiva/u }));

    expect(screen.getByText('Hoja dinámica real')).toBeVisible();
    expect(
      screen.getByText(/Selecciona una plantilla para actualizar los atributos permitidos/u),
    ).toBeVisible();
  });

  it('removes sales-only product metadata and completeness controls from the UI', () => {
    render(
      <ProductsCatalog
        showProductStatus={false}
        showCompleteness={false}
        showTableDescriptionAndTemplate={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));
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

    await screen.findByText('SKU-FAG');
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
    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));

    const category = await screen.findByRole('combobox', {
      name: 'Filtrar la tabla por categoría',
    });
    fireEvent.focus(category);
    fireEvent.click(screen.getByRole('button', { name: 'Rodamientos' }));

    expect(mocks.workbook).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: '33333333-3333-4333-8333-333333333333' }),
    );
  });

  it('keeps the controls available when the backend returns no matches', async () => {
    mocks.fetchWorkbook.mockResolvedValue({
      columns: [],
      items: [],
      facets: { brands: [], applicationTypes: [], statuses: [] },
      total: 0,
      page: 1,
      pageSize: 25,
    });
    render(<ProductsCatalog initialSearch="Sin coincidencias" />);

    expect(await screen.findByText('Sin resultados para estos criterios')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Paginación del catálogo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Limpiar criterios' })).toBeVisible();
  });

  it('filters the catalog list with the persisted category id instead of guessing by name', async () => {
    render(<ProductsCatalog />);

    fireEvent.click(screen.getByRole('button', { name: /Filtros/u }));
    const category = await screen.findByRole('combobox', { name: 'Línea / categoría' });
    fireEvent.focus(category);
    fireEvent.click(await screen.findByRole('button', { name: 'Rodamientos' }));

    expect(category).toBeEnabled();
    await waitFor(() =>
      expect(mocks.fetchWorkbook).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoryId: '33333333-3333-4333-8333-333333333333' }),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText('SKU-FAG')).toBeVisible();
  });

  it('keeps an unclassified SKU visible and accessible without offering enrichment edits', async () => {
    const initial = await mocks.fetchWorkbook();
    mocks.fetchWorkbook.mockResolvedValue({
      ...initial,
      items: [
        {
          ...initial.items[0],
          sku: 'SKU-PENDING',
          category: null,
          template: null,
          completeness: null,
        },
      ],
      total: 1,
    });
    render(<ProductsCatalog canEditAttributes showCompleteness />);
    const link = await screen.findByRole('link', { name: 'SKU-PENDING' });
    const row = within(link.closest('li') as HTMLLIElement);
    expect(row.getAllByText('Pendiente de clasificación').length).toBeGreaterThan(0);
    expect(row.getByRole('link', { name: 'Ver producto' })).toHaveAttribute(
      'href',
      `/products/${products[0]!.id}`,
    );
    expect(row.queryByRole('link', { name: 'Editar enriquecimiento' })).not.toBeInTheDocument();
    expect(row.getByText('Sin indicador de completitud')).toBeVisible();
  });

  it('selects real parent category IDs from the hierarchy', async () => {
    render(<ProductsCatalog />);
    fireEvent.click(screen.getByRole('button', { name: /Filtros/u }));
    const category = await screen.findByRole('combobox', { name: 'Línea / categoría' });
    fireEvent.focus(category);
    fireEvent.click(await screen.findByRole('button', { name: 'Catálogo industrial' }));
    await waitFor(() =>
      expect(mocks.fetchWorkbook).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
        expect.any(AbortSignal),
      ),
    );
    expect(category).toHaveValue('Catálogo industrial');
  });

  it('applies category links from the dashboard on the initial catalog request', async () => {
    window.history.replaceState({}, '', '/products?category=33333333-3333-4333-8333-333333333333');
    render(<ProductsCatalog />);

    await waitFor(() =>
      expect(mocks.fetchWorkbook).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: '33333333-3333-4333-8333-333333333333' }),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole('combobox', { name: 'Línea / categoría' })).toBeEnabled();
  });
});
