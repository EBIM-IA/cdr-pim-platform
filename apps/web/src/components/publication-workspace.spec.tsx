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
  experience: vi.fn(),
  downloadWorkbook: vi.fn(),
  downloadBinary: vi.fn(),
}));
vi.mock('@/lib/tabular-export', () => ({ downloadWorkbookXlsx: api.downloadWorkbook }));
vi.mock('@/lib/zip-export', () => ({ downloadBinary: api.downloadBinary }));
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
vi.mock('@/lib/product-experience-api', () => ({ fetchProductExperience: api.experience }));
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
  api.experience.mockResolvedValue({ nombreGeneral: 'Rodamiento', variants: [], fields: [] });
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
    expect(screen.getByRole('button', { name: 'Publicar todos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ninguno (solo código)' })).toBeDisabled();
  });

  it('applies bulk selection with optimistic concurrency and exposes a partial failure honestly', async () => {
    const other = { ...attribute, id: 'attribute-2', key: 'ancho', label: 'Ancho' };
    api.template.mockResolvedValue({ attributes: [attribute, other] });
    api.update
      .mockResolvedValueOnce({
        ...attribute,
        publishable: true,
        updatedAt: '2026-11-16T00:00:00.000Z',
      })
      .mockRejectedValueOnce(new Error('La plantilla cambió'));
    render(<PublicationWorkspace workspace={workspace} view="channels" canManage />);
    await screen.findByRole('switch', { name: 'Publicar en PrestaShop: Ancho' });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar todos' }));
    expect(await screen.findByText(/1 de 2 cambios guardados.*La plantilla cambió/)).toBeVisible();
    expect(
      screen.getByRole('switch', { name: 'Publicar en PrestaShop: Diámetro' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Publicar en PrestaShop: Ancho' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(api.update).toHaveBeenLastCalledWith('template-1', 'attribute-2', {
      publishable: true,
      expectedUpdatedAt: attribute.updatedAt,
    });
  });

  it('exports every page of the category and downloads an explicitly proposed JSON preserving zero', async () => {
    api.template.mockResolvedValue({ attributes: [{ ...attribute, publishable: true }] });
    api.grid.mockImplementation(async (query: { page: number; pageSize: number }) => ({
      items: [
        {
          ...product,
          ...(query.page === 2 ? { id: 'product-2', sku: 'SKU-2' } : {}),
          attributes: { diametro: { value: query.page === 2 ? 42 : 0 } },
        },
      ],
      total: 2,
      page: query.page,
      pageSize: query.pageSize,
    }));
    render(<PublicationWorkspace workspace={workspace} view="channels" canManage />);
    await screen.findByRole('switch', { name: 'Publicar en PrestaShop: Diámetro' });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar vista previa (Excel)' }));
    await waitFor(() => expect(api.downloadWorkbook).toHaveBeenCalled());
    expect(api.grid).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 100 }));
    expect(api.downloadWorkbook).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rows: [
            ['SKU-REAL', 0],
            ['SKU-2', 42],
          ],
        }),
      ]),
      'prestashop-vista-previa-Rodamientos',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ejemplo JSON del SKU' }));
    const bytes = api.downloadBinary.mock.calls[0]?.[0] as Uint8Array;
    const json = JSON.parse(new TextDecoder().decode(bytes));
    expect(json.atributos).toEqual([expect.objectContaining({ clave: 'diametro', valor: 0 })]);
    expect(json.nota).toContain('No se publicó en PrestaShop');
  });

  it('shows operation-specific pending contract details without defining a remote endpoint', async () => {
    render(<PublicationWorkspace workspace={workspace} view="prestashop" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Detalle' })[2]!);
    expect(await screen.findByText('URLs firmadas o públicas')).toBeVisible();
    expect(screen.getByText('Tamaños de imagen')).toBeVisible();
  });

  it('keeps distinct category contexts when two categories share a template', async () => {
    api.categories.mockResolvedValue([
      {
        id: 'category-1',
        templateId: 'template-1',
        name: 'Rodamientos',
        templateName: 'Rodamiento',
      },
      {
        id: 'category-2',
        templateId: 'template-1',
        name: 'Otra categoría',
        templateName: 'Rodamiento',
      },
    ]);
    render(<PublicationWorkspace workspace={workspace} view="channels" canManage />);
    await screen.findByRole('switch', { name: 'Publicar en PrestaShop: Diámetro' });
    fireEvent.change(screen.getByLabelText('Categoría y plantilla'), {
      target: { value: 'category-2:template-1' },
    });
    await waitFor(() =>
      expect(api.grid).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoryId: 'category-2', templateId: 'template-1' }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByText(/Esta plantilla se comparte con Rodamientos/)).toBeVisible();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('rejects incomplete category exports instead of downloading a partial workbook', async () => {
    api.grid.mockImplementation(async (query: { pageSize: number }) => ({
      items: query.pageSize === 100 ? [] : [product],
      total: 2,
      page: 1,
      pageSize: query.pageSize,
    }));
    render(<PublicationWorkspace workspace={workspace} view="channels" canManage />);
    await screen.findByRole('switch', { name: 'Publicar en PrestaShop: Diámetro' });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar vista previa (Excel)' }));
    expect(
      await screen.findByText('La descarga quedó incompleta. Vuelve a intentar.'),
    ).toBeVisible();
    expect(api.downloadWorkbook).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Volver a cargar configuración' })).toBeEnabled();
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
