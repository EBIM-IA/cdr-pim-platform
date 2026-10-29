import type {
  AdminTemplateAttributeDto,
  CatalogWorkbookProductDto,
  WorkspaceDto,
} from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  categories: vi.fn(),
  grid: vi.fn(),
  schema: vi.fn(),
  workbook: vi.fn(),
  sheet: vi.fn(),
  template: vi.fn(),
  update: vi.fn(),
  assets: vi.fn(),
}));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogCategories: api.categories,
  fetchCatalogGrid: api.grid,
  fetchCatalogSchema: api.schema,
  fetchCatalogWorkbook: api.workbook,
  fetchProductAttributeSheet: api.sheet,
}));
vi.mock('@/lib/catalog-admin-api', () => ({
  getAdminTemplate: api.template,
  updateAdminTemplateAttribute: api.update,
}));
vi.mock('@/lib/product-assets-api', () => ({ listProductAssets: api.assets }));

import { PublicationWorkspace, publicationReadiness } from './publication-workspace';

const attribute: AdminTemplateAttributeDto = {
  id: 'attribute-1',
  key: 'diametro',
  label: 'Diámetro',
  dataType: 'measurement',
  unit: 'mm',
  allowedValues: [],
  required: true,
  replicable: false,
  searchable: true,
  includeInTechnicalSheet: false,
  sourceAuthority: 'pim',
  position: 1,
  active: true,
  publishable: false,
  updatedAt: '2026-10-22T00:00:00.000Z',
  roleAccess: [],
};
const product: CatalogWorkbookProductDto = {
  id: 'product-1',
  sku: 'SKU-REAL',
  name: 'Rodamiento',
  description: null,
  brand: 'CDR',
  status: 'in_review',
  updatedAt: '2026-10-22T00:00:00.000Z',
  category: { id: 'category-1', name: 'Rodamientos' },
  template: { id: 'template-1', variantKey: 'default', name: 'Rodamiento', version: 1 },
  providerCode: null,
  unifiedCode: null,
  applicationTypes: [],
  completeness: 100,
  attributes: {},
};
const workspace: WorkspaceDto = {
  slug: 'publication',
  operationalStatus: 'partial',
  generatedAt: '2026-10-22T00:00:00.000Z',
  metrics: [{ key: 'publishable', label: 'Completos', value: 3, format: 'integer' }],
  columns: [],
  rows: [],
  totalRows: 105,
  notices: [],
  actions: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  api.categories.mockResolvedValue([
    { id: 'category-1', templateId: 'template-1', name: 'Rodamientos', templateName: 'Rodamiento' },
  ]);
  api.template.mockResolvedValue({ attributes: [attribute] });
  api.schema.mockResolvedValue({ columns: [attribute] });
  api.grid.mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 25 });
  api.workbook.mockResolvedValue({
    items: [product],
    total: 105,
    page: 1,
    pageSize: 25,
    columns: [],
    facets: {},
  });
  api.sheet.mockResolvedValue({
    schema: { columns: [attribute] },
    product: { ...product, attributes: { diametro: { value: 0 } } },
  });
  api.assets.mockResolvedValue([]);
});
afterEach(cleanup);

describe('PublicationWorkspace', () => {
  it('loads the chosen template on the server and persists the real flag with optimistic concurrency', async () => {
    api.update.mockResolvedValue({
      ...attribute,
      publishable: true,
      updatedAt: '2026-10-22T00:01:00.000Z',
    });
    render(<PublicationWorkspace workspace={workspace} view="channels" canManage />);
    const toggle = await screen.findByRole('switch', { name: 'Publicar en PrestaShop: Diámetro' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(api.grid).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'template-1', categoryId: 'category-1' }),
      expect.any(AbortSignal),
    );
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('template-1', 'attribute-1', {
        publishable: true,
        expectedUpdatedAt: attribute.updatedAt,
      }),
    );
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(
      await screen.findByText(
        'Diámetro: configuración guardada para todos los SKU de la plantilla.',
      ),
    ).toBeVisible();
  });

  it('keeps consultation read only and does not claim complete products are approved for a channel', async () => {
    render(<PublicationWorkspace workspace={workspace} view="channels" />);
    expect(
      await screen.findByRole('switch', { name: 'Publicar en PrestaShop: Diámetro' }),
    ).toBeDisabled();
    expect(api.template).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Pendiente de evaluación')).toBeVisible());
    expect(publicationReadiness({ ...product, completeness: 99 }).label).toBe('No publicable');
    expect(publicationReadiness({ ...product, template: null }).reason).toBe(
      'Sin plantilla activa asignada.',
    );
    expect(api.update).not.toHaveBeenCalled();
  });

  it('fetches subsequent product pages and filters missing requirements on the server', async () => {
    render(<PublicationWorkspace workspace={workspace} view="channels" canManage />);
    await screen.findByText('105 SKU · página 1');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(api.workbook).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Con faltantes obligatorios' }));
    await waitFor(() =>
      expect(api.workbook).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, completeness: 'incomplete' }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('opens documents for the selected product instead of sending an unsupported SKU parameter', async () => {
    render(<PublicationWorkspace workspace={workspace} view="images" />);
    expect(
      screen.getByRole('region', { name: 'Indicadores de migración de imágenes' }),
    ).toBeVisible();
    expect(screen.queryByText('45.280')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Ver activos del SKU en PIM' })).toHaveAttribute(
        'href',
        '/documents?productId=product-1',
      ),
    );
  });

  it('preserves the selected product when opening commercial enrichment', async () => {
    render(<PublicationWorkspace workspace={workspace} view="prestashop" />);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Descripción comercial' })).toHaveAttribute(
        'href',
        '/quality?view=commercial&productId=product-1',
      ),
    );
  });

  it('omits deselected fields from the consumption preview without hiding media errors', async () => {
    render(<PublicationWorkspace workspace={workspace} view="prestashop" />);
    await waitFor(() => expect(screen.getByText('0 de 0 con valor')).toBeVisible());
    expect(screen.getByText('0 registrados')).toBeVisible();
    expect(api.assets).toHaveBeenCalledTimes(1);
  });
});
