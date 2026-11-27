import type {
  AdminTemplateAttributeDto,
  CatalogWorkbookProductDto,
  EcommerceImageDto,
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
  imageStatus: vi.fn(),
  imageLookup: vi.fn(),
  imageImport: vi.fn(),
  imageHistory: vi.fn(),
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
vi.mock('@/lib/ecommerce-images-api', () => ({
  fetchEcommerceImageStatus: api.imageStatus,
  lookupEcommerceImages: api.imageLookup,
  importEcommerceImage: api.imageImport,
  fetchEcommerceImageHistory: api.imageHistory,
}));

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
const photo: EcommerceImageDto = {
  assetId: 'asset-a',
  position: 1,
  cover: false,
  filename: 'lateral.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 100,
  checksumSha256: 'a'.repeat(64),
  canImport: true,
};
const cover: EcommerceImageDto = {
  ...photo,
  assetId: 'asset-b',
  position: 2,
  cover: true,
  filename: 'portada.jpg',
  checksumSha256: 'b'.repeat(64),
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
  api.imageStatus.mockResolvedValue({ configured: true });
  api.imageHistory.mockResolvedValue({ items: [] });
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

  it('looks up an exact ecommerce SKU and imports selected photos cover first using the looked-up checksum', async () => {
    const ecommerceSku = 'nvZ-00577';
    const target = { productId: product.id, ecommerceSku };
    const identity = { ...target, pimSku: product.sku };
    api.imageLookup.mockResolvedValue({
      items: [
        {
          ...identity,
          status: 'found',
          images: [
            photo,
            cover,
            { ...photo, assetId: 'asset-c', filename: 'animada.gif', canImport: false },
          ],
        },
      ],
    });
    api.imageImport.mockImplementation(async ({ assets }) => {
      const image = assets[0].assetId === cover.assetId ? cover : photo;
      return {
        ...identity,
        items: [
          {
            assetId: image.assetId,
            filename: image.filename,
            status: image.cover ? 'imported' : 'existing',
            productAssetId: `pim-${image.assetId}`,
          },
        ],
      };
    });
    api.imageHistory.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({
      items: [
        {
          ...identity,
          assetId: 'pim-asset-b',
          filename: cover.filename,
          importedAt: '2026-11-27T18:00:00Z',
          active: true,
        },
      ],
    });
    render(<PublicationWorkspace workspace={workspace} view="images" canManage />);
    const lookup = await screen.findByRole('button', { name: 'Consultar imágenes' });
    await waitFor(() => expect(lookup).toBeEnabled());
    fireEvent.change(screen.getByRole('textbox', { name: 'SKU ecommerce (opcional)' }), {
      target: { value: ecommerceSku },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Imágenes a consultar' }), {
      target: { value: 'own' },
    });
    fireEvent.click(lookup);
    const selectAll = await screen.findByRole('button', {
      name: 'Seleccionar imágenes disponibles',
    });
    expect(api.imageLookup).toHaveBeenCalledWith(
      { targets: [target], mode: 'own' },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Portada')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /animada\.gif/ })).not.toBeInTheDocument();
    fireEvent.click(selectAll);
    fireEvent.click(screen.getByRole('button', { name: 'Importar selección al PIM (2)' }));
    expect(await screen.findByText('2 de 2 imágenes procesadas.')).toBeVisible();
    expect(api.imageImport).toHaveBeenNthCalledWith(
      1,
      {
        target,
        mode: 'own',
        assets: [{ assetId: cover.assetId, checksumSha256: cover.checksumSha256 }],
      },
      expect.any(AbortSignal),
    );
    expect(api.imageImport).toHaveBeenNthCalledWith(
      2,
      {
        target,
        mode: 'own',
        assets: [{ assetId: photo.assetId, checksumSha256: photo.checksumSha256 }],
      },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Importada al PIM')).toBeVisible();
    expect(screen.getByText('Ya estaba en el PIM')).toBeVisible();
    expect(await screen.findByText('En galería')).toBeVisible();
  });

  it('keeps batch lookups in order with a separate failure per SKU and hides imports for read-only actors', async () => {
    const missing = { ...product, id: 'product-2', sku: 'SKU-SIN-TIENDA' };
    api.workbook.mockResolvedValue({ items: [product, missing], total: 2, page: 1, pageSize: 25 });
    api.imageLookup.mockResolvedValue({
      items: [
        {
          productId: product.id,
          pimSku: product.sku,
          ecommerceSku: product.sku,
          status: 'found',
          images: [cover],
        },
        {
          productId: missing.id,
          pimSku: missing.sku,
          ecommerceSku: missing.sku,
          status: 'error',
          error: {
            code: 'ECOMMERCE_NOT_FOUND',
            message: 'SKU no disponible en el ecommerce.',
            correlationId: 'Narviz-123',
          },
        },
      ],
    });
    render(<PublicationWorkspace workspace={workspace} view="images" canQueryImages />);
    const add = await screen.findByRole('button', { name: 'Añadir SKU al lote' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.change(screen.getByRole('combobox', { name: 'SKU en contexto' }), {
      target: { value: missing.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir SKU al lote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
    expect(
      await screen.findByText('SKU no disponible en el ecommerce. Referencia Narviz-123.'),
    ).toBeVisible();
    expect(api.imageLookup).toHaveBeenCalledWith(
      {
        targets: [{ productId: product.id }, { productId: missing.id }],
        mode: 'resolved',
      },
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole('button', { name: /Importar selección/ })).not.toBeInTheDocument();
    expect(api.imageImport).not.toHaveBeenCalled();
  });

  it('keeps ecommerce queries unavailable until the backend is configured', async () => {
    api.imageStatus.mockResolvedValue({ configured: false });
    render(<PublicationWorkspace workspace={workspace} view="images" canManage />);
    expect(
      await screen.findByText('La integración con Narviz está pendiente de configuración.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Consultar imágenes' })).not.toBeInTheDocument();
    expect(api.imageLookup).not.toHaveBeenCalled();
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
