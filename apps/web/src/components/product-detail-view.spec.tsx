import type { ProductAttributeSheetDto, ProductExperienceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProduct } from '@/lib/catalog-api';
import {
  fetchProductAttributeSheet,
  fetchProductTechnicalSheet,
  fetchCatalogCategories,
  patchProductAttributes,
  reassignProductTemplate,
} from '@/lib/dynamic-catalog-api';
import {
  listApplications,
  listAuditChanges,
  listHomologs,
  listOemCodes,
} from '@/lib/operational-api';
import type { Product } from '@/lib/types';
import { fetchProductExperience } from '@/lib/product-experience-api';
import { listProductAssets, uploadProductAsset } from '@/lib/product-assets-api';

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
  fetchProductTechnicalSheet: vi.fn(),
  fetchCatalogCategories: vi.fn(),
  patchProductAttributes: vi.fn(),
  reassignProductTemplate: vi.fn(),
}));
vi.mock('@/lib/operational-api', () => ({
  listApplications: vi.fn(),
  listAuditChanges: vi.fn(),
  listHomologs: vi.fn(),
  listOemCodes: vi.fn(),
}));

vi.mock('@/lib/product-experience-api', () => ({ fetchProductExperience: vi.fn() }));
vi.mock('@/lib/product-assets-api', () => ({
  listProductAssets: vi.fn(),
  productAssetDownloadUrl: (id: string) => `/api/product-assets/${id}/download`,
  uploadProductAsset: vi.fn(),
}));

const product: Product = {
  id: '55555555-5555-4555-8555-555555555555',
  sku: 'D1672',
  name: 'Pastilla de freno D1672',
  brand: 'CDR',
  providerCode: 'D1672-CARBON',
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

const applicationId = '66666666-6666-4666-8666-666666666666';
const baseVariant = {
  productId: product.id,
  codigoArticulo: product.sku,
  marca: product.brand,
  codigoProveedor: product.providerCode!,
  codigoUnificador: 'D1672',
};
const experience: ProductExperienceDto = {
  nombreGeneral: 'Pastilla de freno cerámica CDR',
  fields: [],
  variants: [
    {
      ...baseVariant,
      nombreAmigable: 'Pastilla CDR para Toyota Hilux 2016–2024',
      tipo: 'automotriz',
      ficha: `/products/${product.id}?aplicacion=${applicationId}`,
      aplicacion: {
        id: applicationId,
        marcaVehiculo: 'Toyota',
        modelo: 'Hilux',
        tipo: 'PICKUP',
        combustible: 'DIESEL',
        traccion: '4X4',
        cilindraje: '2.8L',
        anioDesde: 2016,
        anioHasta: 2024,
        area: 'MOTOR',
        subarea: 'INYECCIÓN',
        motor: '2.8',
      },
    },
    {
      ...baseVariant,
      nombreAmigable: 'Pastilla CDR para Nissan Sentra 2015–2022',
      tipo: 'automotriz',
      ficha: `/products/${product.id}?aplicacion=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      aplicacion: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        marcaVehiculo: 'Nissan',
        modelo: 'Sentra',
        tipo: 'SEDAN',
        combustible: 'GASOLINA',
        traccion: '4X2',
        cilindraje: '1.8L',
        anioDesde: 2015,
        anioHasta: 2022,
        area: 'FRENOS',
        subarea: 'DELANTERO',
        motor: '1.8',
      },
    },
    {
      ...baseVariant,
      nombreAmigable: 'D1672 Pastilla de freno CDR para uso industrial',
      tipo: 'industrial',
      ficha: `/products/${product.id}?uso=industrial`,
      aplicacion: null,
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
      variantKey: '15',
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

afterEach(cleanup);

beforeEach(() => {
  window.history.replaceState({}, '', `/products/${product.id}`);
  vi.clearAllMocks();
  vi.mocked(fetchProduct).mockResolvedValue(product);
  vi.mocked(fetchProductExperience).mockResolvedValue(experience);
  vi.mocked(listProductAssets).mockResolvedValue([]);
  vi.mocked(fetchProductAttributeSheet).mockResolvedValue(sheet);
  vi.mocked(fetchProductTechnicalSheet).mockResolvedValue(sheet);
  vi.mocked(fetchCatalogCategories).mockResolvedValue([
    {
      id: sheet.schema.category.id,
      slug: sheet.schema.category.slug,
      name: sheet.schema.category.name,
      path: sheet.schema.category.slug,
      templateId: sheet.schema.template.id,
      templateVariantKey: sheet.schema.template.variantKey,
      templateName: sheet.schema.template.name,
      templateVersion: sheet.schema.template.version,
    },
  ]);
  vi.mocked(patchProductAttributes).mockResolvedValue({
    productId: product.id,
    attributes: [],
  });
  vi.mocked(reassignProductTemplate).mockResolvedValue({
    productId: product.id,
    category: sheet.schema.category,
    previousTemplateId: sheet.schema.template.id,
    template: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      variantKey: '15.2',
      name: 'Plantilla pastillas cerámicas',
      version: 1,
    },
    assignedAt: '2026-10-07T10:00:00.000Z',
  });
  vi.mocked(listApplications).mockResolvedValue([
    {
      id: '66666666-6666-4666-8666-666666666666',
      groupId: '77777777-7777-4777-8777-777777777777',
      unifiedCode: 'D1672',
      vehicleType: 'AUTOMOTRIZ',
      make: 'Toyota',
      model: 'Hilux',
      bodyStyle: 'PICKUP',
      fuel: 'DIESEL',
      traction: '4X4',
      displacement: '2.8L',
      yearFrom: 2016,
      yearTo: 2024,
      area: 'MOTOR',
      subarea: 'INYECCIÓN',
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
  vi.mocked(listOemCodes).mockResolvedValue([]);
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
  it.each([
    { role: 'ADMINISTRADOR', showCompleteness: true, showProductStatus: true },
    { role: 'COMPRAS', showCompleteness: false, showProductStatus: true },
    { role: 'VENTAS', showCompleteness: false, showProductStatus: false },
  ])(
    'shows the friendly name and the proper application controls for $role',
    async ({ role, ...props }) => {
      const view = render(<ProductDetailView productId={product.id} {...props} />);
      const rendered = within(view.container);
      expect(
        await rendered.findByRole('heading', { name: experience.nombreGeneral, level: 1 }),
      ).toBeInTheDocument();
      const picker = rendered.getByLabelText('Aplicaciones del SKU');
      expect(picker).toBeInTheDocument();
      expect(
        within(picker).getByRole('button', { name: /Toyota Hilux 2016–2024/ }),
      ).toBeInTheDocument();
      expect(within(picker).getByRole('button', { name: /Uso industrial/ })).toBeInTheDocument();
      if (role === 'ADMINISTRADOR') {
        expect(rendered.getByRole('heading', { name: 'Control PIM' })).toBeInTheDocument();
        expect(rendered.getByRole('tab', { name: 'Aplicaciones' })).toBeInTheDocument();
        expect(picker).toHaveAttribute('role', 'group');
      } else {
        expect(rendered.queryByRole('heading', { name: 'Control PIM' })).not.toBeInTheDocument();
        expect(rendered.queryByRole('tab', { name: 'Aplicaciones' })).not.toBeInTheDocument();
        expect(picker.tagName).toBe('DIV');
      }
      expect(fetchProductExperience).toHaveBeenCalledWith(product.id, expect.any(AbortSignal));
    },
  );

  it('opens an application deep link, preserves other URL context and restores the general name', async () => {
    window.history.replaceState(
      {},
      '',
      `/products/${product.id}?aplicacion=${applicationId}&idbar=b&origen=catalogo#detalle`,
    );
    const view = render(<ProductDetailView productId={product.id} showProductStatus={false} />);
    const rendered = within(view.container);
    expect(
      await rendered.findByRole('heading', {
        name: experience.variants[0]!.nombreAmigable,
        level: 1,
      }),
    ).toBeInTheDocument();
    const identity = rendered.getByLabelText('Contexto persistente del producto');
    expect(identity).toHaveTextContent('Código unificador');
    expect(identity).toHaveTextContent('Toyota Hilux 2016–2024');
    expect(identity.className).toContain('darkIdentity');

    fireEvent.click(rendered.getByRole('button', { name: /Uso industrial/ }));
    expect(
      rendered.getByRole('heading', { name: experience.variants[2]!.nombreAmigable, level: 1 }),
    ).toBeInTheDocument();
    expect(window.location.search).toContain('uso=industrial');
    expect(window.location.search).not.toContain('aplicacion=');
    expect(window.location.search).toContain('idbar=b');
    expect(window.location.search).toContain('origen=catalogo');
    expect(window.location.hash).toBe('#detalle');
    expect(identity).toHaveTextContent('Uso industrial');

    fireEvent.click(rendered.getByRole('button', { name: 'Ver nombre general' }));
    expect(
      rendered.getByRole('heading', { name: experience.nombreGeneral, level: 1 }),
    ).toBeInTheDocument();
    expect(window.location.search).not.toMatch(/uso=|aplicacion=/u);
    expect(window.location.search).toContain('idbar=b');
    expect(identity).not.toHaveTextContent('Uso industrial');
  });

  it('updates a selected application on browser navigation and ignores unavailable variant IDs', async () => {
    const view = render(<ProductDetailView productId={product.id} showCompleteness />);
    const rendered = within(view.container);
    await rendered.findByRole('heading', { name: experience.nombreGeneral, level: 1 });
    fireEvent.click(rendered.getByRole('button', { name: 'Toyota Hilux 2016–2024' }));
    expect(window.location.search).toBe(`?aplicacion=${applicationId}`);
    expect(rendered.getByRole('button', { name: 'Toyota Hilux 2016–2024' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    window.history.replaceState({}, '', `/products/${product.id}?uso=industrial`);
    fireEvent.popState(window);
    expect(
      rendered.getByRole('heading', { name: experience.variants[2]!.nombreAmigable, level: 1 }),
    ).toBeInTheDocument();
    window.history.replaceState({}, '', `/products/${product.id}?aplicacion=unavailable&idbar=b`);
    fireEvent.popState(window);
    expect(
      rendered.getByRole('heading', { name: experience.nombreGeneral, level: 1 }),
    ).toBeInTheDocument();
    expect(rendered.getByLabelText('Contexto persistente del producto').className).toContain(
      'darkIdentity',
    );
    expect(rendered.getByRole('button', { name: 'Toyota Hilux 2016–2024' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it.each([
    { showCompleteness: true, showProductStatus: true },
    { showCompleteness: false, showProductStatus: true },
    { showCompleteness: false, showProductStatus: false },
  ])('keeps name, value and abbreviation in order and folds ERP last for %o', async (props) => {
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: [
          ...sheet.schema.columns,
          {
            ...sheet.schema.columns[1]!,
            key: 'diametro',
            label: '(d) Diámetro interior',
            dataType: 'measurement',
            unit: 'mm',
            position: 3,
          },
        ],
      },
      product: {
        ...sheet.product,
        attributes: {
          ...sheet.product.attributes,
          diametro: {
            value: 25,
            version: 1,
            source: 'manual',
            updatedAt: product.updatedAt!,
          },
        },
      },
    });
    const view = render(<ProductDetailView productId={product.id} {...props} />);
    const rendered = within(view.container);
    const table = await rendered.findByRole('table', { name: 'Medidas y datos de rendimiento' });
    const row = within(table).getAllByRole('row')[1] as HTMLTableRowElement;
    expect(row.cells[0]).toHaveTextContent('Diámetro interior');
    expect(row.cells[1]).toHaveTextContent('25 mm');
    expect(row.cells[2]).toHaveTextContent('d');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Atributo y origen', 'Valor', 'Abreviatura']);
    const fold = rendered
      .getByText('Datos base ERP', { selector: 'summary h3' })
      .closest('details')!;
    expect(fold).not.toHaveAttribute('open');
    expect(fold.parentElement?.lastElementChild).toBe(fold);
    expect(fold.querySelector('table')).not.toBeVisible();
    fireEvent.click(within(fold).getByText('Datos base ERP', { selector: 'h3' }));
    expect(fold.querySelector('table')).toBeVisible();
    expect(within(fold).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('uses real product photographs in the gallery before the final technical drawing', async () => {
    const assetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    vi.mocked(listProductAssets).mockResolvedValue([
      {
        id: assetId,
        productId: product.id,
        sku: product.sku,
        kind: 'image',
        type: 'FOTO',
        filename: 'pastilla.jpg',
        mimeType: 'image/jpeg',
        size: 500,
        checksum: 'checksum',
        position: 1,
        source: 'manual',
        uploadedBy: 'admin',
        uploadedAt: product.updatedAt!,
        replacesAssetId: null,
      },
    ]);
    const view = render(<ProductDetailView productId={product.id} />);
    const rendered = within(view.container);
    const gallery = await rendered.findByRole('region', { name: 'Galería del producto' });
    expect(
      within(gallery).getByRole('img', { name: `${product.name} · pastilla.jpg` }),
    ).toHaveAttribute('src', `/api/product-assets/${assetId}/download`);
    fireEvent.click(within(gallery).getByRole('button', { name: 'Imagen siguiente' }));
    expect(within(gallery).getByText('Esquema técnico referencial · 2/2')).toBeInTheDocument();
    expect(
      within(gallery).queryByRole('img', { name: `${product.name} · pastilla.jpg` }),
    ).not.toBeInTheDocument();
  });

  it('keeps the registered product name usable when the names service fails', async () => {
    vi.mocked(fetchProductExperience).mockRejectedValue(new Error('unavailable'));
    render(<ProductDetailView productId={product.id} />);
    expect(
      await screen.findByRole('heading', { name: product.name, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No fue posible consultar los nombres y las variantes del producto.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Uso industrial/ })).not.toBeInTheDocument();
  });

  it('updates the header gallery after an authorized photograph upload', async () => {
    const asset = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      productId: product.id,
      sku: product.sku,
      kind: 'image' as const,
      type: 'FOTO' as const,
      filename: 'nueva-pastilla.jpg',
      mimeType: 'image/jpeg',
      size: 500,
      checksum: 'checksum',
      position: 1,
      source: 'manual' as const,
      uploadedBy: 'admin',
      uploadedAt: product.updatedAt!,
      replacesAssetId: null,
    };
    vi.mocked(uploadProductAsset).mockResolvedValue(asset);
    const view = render(
      <ProductDetailView productId={product.id} canWriteAssets showCompleteness />,
    );
    const rendered = within(view.container);
    await rendered.findByRole('heading', { name: experience.nombreGeneral, level: 1 });
    fireEvent.click(rendered.getByRole('tab', { name: 'Imágenes y Documentos' }));
    fireEvent.change(await rendered.findByRole('combobox', { name: 'Tipo de activo' }), {
      target: { value: 'FOTO' },
    });
    const file = new File(['photo'], asset.filename, { type: asset.mimeType });
    fireEvent.change(rendered.getByLabelText('Archivo individual'), { target: { files: [file] } });
    fireEvent.submit(rendered.getByRole('button', { name: 'Subir al SKU' }).closest('form')!);
    const gallery = rendered.getByRole('region', { name: 'Galería del producto' });
    expect(
      await within(gallery).findByRole('img', { name: `${product.name} · ${asset.filename}` }),
    ).toHaveAttribute('src', `/api/product-assets/${asset.id}/download`);
    expect(uploadProductAsset).toHaveBeenCalledWith({ productId: product.id, type: 'FOTO', file });
    fireEvent.click(rendered.getByRole('tab', { name: 'Información técnica' }));
    expect(rendered.getByLabelText('Documentos y calidad del SKU')).toHaveTextContent(
      asset.filename,
    );
  });

  it('loads the sheet, relations and audit, then renders real tab content', async () => {
    const view = render(<ProductDetailView productId={product.id} showCompleteness />);

    expect(await screen.findByText('Pastilla cerámica')).toBeInTheDocument();
    expect(screen.getByText('Fuente: Manual')).toBeInTheDocument();
    expect(screen.getByText('Autoridad: PIM')).toBeInTheDocument();
    expect(screen.getByText('Solo detalle')).toBeInTheDocument();

    const persistentContext = view.container.querySelector(
      '[aria-label="Contexto persistente del producto"]',
    );
    expect(persistentContext).not.toBeNull();
    expect(within(persistentContext as HTMLElement).getByText('D1672-CARBON')).toBeInTheDocument();
    expect(within(persistentContext as HTMLElement).getByText('CDR')).toBeInTheDocument();
    expect(persistentContext?.parentElement).toHaveClass('sticky', 'top-12', 'md:top-0');
    expect(
      within(persistentContext?.parentElement as HTMLElement).getByRole('tablist', {
        name: 'Secciones de la ficha',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Código Unificador y Homólogos' })).toBeInTheDocument();

    await waitFor(() => {
      expect(listApplications).toHaveBeenCalledWith(
        { unifiedCode: 'D1672' },
        expect.any(AbortSignal),
      );
      expect(listHomologs).toHaveBeenCalledWith({ unifiedCode: 'D1672' }, expect.any(AbortSignal));
      expect(listOemCodes).toHaveBeenCalledWith({ unifiedCode: 'D1672' }, expect.any(AbortSignal));
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

    expect(
      await screen.findByRole('heading', { name: experience.nombreGeneral, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('SKU')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos mostrar esta ficha')).not.toBeInTheDocument();
  });

  it('hides lifecycle status and completeness from the sales detail', async () => {
    const view = render(
      <ProductDetailView
        productId={product.id}
        showProductStatus={false}
        showCompleteness={false}
      />,
    );

    const rendered = within(view.container);
    expect(
      await rendered.findByRole('heading', { name: experience.nombreGeneral, level: 1 }),
    ).toBeInTheDocument();
    expect(rendered.queryByText('Publicado')).not.toBeInTheDocument();
    expect(rendered.queryByText('Regla pendiente')).not.toBeInTheDocument();
    expect(
      rendered.queryByRole('button', { name: 'Editar enriquecimiento' }),
    ).not.toBeInTheDocument();
    expect(rendered.queryByRole('button', { name: 'Gestionar activos' })).not.toBeInTheDocument();
    expect(rendered.queryByText('Fuente: Manual')).not.toBeInTheDocument();
    expect(rendered.queryByText('Autoridad: PIM')).not.toBeInTheDocument();
    expect(rendered.queryByText('Solo detalle')).not.toBeInTheDocument();
    expect(
      rendered.queryByRole('heading', { name: 'Atributos obligatorios faltantes' }),
    ).not.toBeInTheDocument();
    expect(rendered.queryByRole('tab', { name: 'Fuentes' })).not.toBeInTheDocument();
    expect(rendered.queryByRole('tab', { name: 'Historial' })).not.toBeInTheDocument();
    expect(rendered.getByRole('button', { name: 'Ficha técnica (PDF)' })).toBeInTheDocument();
  });

  it('previews a technical sheet using only attributes enabled by the template', async () => {
    const view = render(<ProductDetailView productId={product.id} />);
    const rendered = within(view.container);

    await rendered.findByRole('heading', { name: experience.nombreGeneral, level: 1 });
    fireEvent.click(rendered.getByRole('button', { name: 'Ficha técnica (PDF)' }));

    const dialog = rendered.getByRole('dialog', { name: `Ficha técnica · ${product.sku}` });
    expect(within(dialog).getByText('Especificaciones publicables')).toBeInTheDocument();
    const exportedAttributes = dialog.querySelector('.sheet-attributes');
    expect(exportedAttributes).not.toBeNull();
    expect(
      within(exportedAttributes as HTMLElement).getByText('Código unificador'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('Descripción interna')).not.toBeInTheDocument();
  });

  it('saves every edited PIM field in one atomic batch', async () => {
    const editableSheet: ProductAttributeSheetDto = {
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: [
          sheet.schema.columns[0]!,
          {
            ...sheet.schema.columns[1]!,
            permissions: { edit: true, import: false, export: false },
          },
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            key: 'color',
            label: 'Color',
            dataType: 'text',
            unit: null,
            allowedValues: [],
            required: false,
            replicable: true,
            searchable: true,
            includeInTechnicalSheet: true,
            sourceAuthority: 'pim',
            position: 3,
            permissions: { edit: true, import: false, export: false },
          },
        ],
      },
      product: {
        ...sheet.product,
        attributes: {
          ...sheet.product.attributes,
          color: {
            value: null,
            version: 0,
            source: 'manual',
            updatedAt: '2026-10-05T10:00:00.000Z',
          },
        },
      },
    };
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue(editableSheet);
    vi.mocked(patchProductAttributes).mockResolvedValue({
      productId: product.id,
      attributes: [
        {
          productId: product.id,
          attributeKey: 'descripcion_interna',
          value: 'Pastilla semimetálica',
          version: 2,
          source: 'manual',
          updatedAt: '2026-10-07T10:00:00.000Z',
          replicatedProductIds: [],
        },
        {
          productId: product.id,
          attributeKey: 'color',
          value: 'Negro',
          version: 1,
          source: 'manual',
          updatedAt: '2026-10-07T10:00:00.000Z',
          replicatedProductIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
        },
      ],
    });

    const view = render(<ProductDetailView productId={product.id} />);
    const rendered = within(view.container);
    const edit = await rendered.findByRole('button', { name: 'Editar enriquecimiento' });
    expect(edit).toBeEnabled();
    fireEvent.click(edit);

    fireEvent.change(rendered.getByLabelText('Descripción interna'), {
      target: { value: 'Pastilla semimetálica' },
    });
    fireEvent.change(rendered.getByLabelText('Color'), { target: { value: 'Negro' } });
    fireEvent.click(rendered.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(patchProductAttributes).toHaveBeenCalledTimes(1);
    });
    expect(patchProductAttributes).toHaveBeenCalledWith(product.id, {
      updates: [
        {
          attributeKey: 'descripcion_interna',
          value: 'Pastilla semimetálica',
          expectedVersion: 1,
        },
        { attributeKey: 'color', value: 'Negro', expectedVersion: 0 },
      ],
    });
    expect(
      await rendered.findByText(
        'Cambios guardados y heredados a 1 SKU del mismo código unificador.',
      ),
    ).toBeInTheDocument();
  });

  it('opens the technical sheet in direct edit mode with versions while keeping ERP values read-only', async () => {
    const editableSheet: ProductAttributeSheetDto = {
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    };
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue(editableSheet);
    vi.mocked(patchProductAttributes).mockResolvedValue({
      productId: product.id,
      attributes: [
        {
          productId: product.id,
          attributeKey: 'descripcion_interna',
          value: 'Pastilla semimetálica',
          version: 2,
          source: 'manual',
          updatedAt: '2026-10-27T10:00:00.000Z',
          replicatedProductIds: [],
        },
      ],
    });
    const view = render(
      <ProductDetailView productId={product.id} canReassignTemplate showCompleteness />,
    );
    const rendered = within(view.container);
    expect(await rendered.findByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Pastilla cerámica',
    );

    expect(rendered.queryByRole('textbox', { name: 'Código unificador' })).not.toBeInTheDocument();
    const saveBar = rendered.getByRole('region', { name: 'Guardar cambios de la ficha' });
    expect(saveBar).toHaveTextContent('0 cambios sin guardar');
    expect(rendered.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(rendered.getByRole('button', { name: 'Descartar cambios' })).toBeDisabled();
    expect(rendered.queryByRole('button', { name: 'Editar atributos' })).not.toBeInTheDocument();
    const input = rendered.getByRole('textbox', { name: 'Descripción interna' });
    fireEvent.change(input, { target: { value: 'Pastilla semimetálica' } });
    expect(saveBar).toHaveTextContent('1 cambio sin guardar');
    expect(input.closest('tr')).toHaveClass('bg-amber-50');
    fireEvent.click(rendered.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(patchProductAttributes).toHaveBeenCalledWith(product.id, {
        updates: [
          {
            attributeKey: 'descripcion_interna',
            value: 'Pastilla semimetálica',
            expectedVersion: 1,
          },
        ],
      }),
    );
    expect(await rendered.findByText('Cambios guardados para este SKU.')).toBeInTheDocument();
    expect(input).toHaveValue('Pastilla semimetálica');
    expect(saveBar).toHaveTextContent('0 cambios sin guardar');
    expect(rendered.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('preserves unsaved technical edits when switching between product tabs', async () => {
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    });
    const view = render(
      <ProductDetailView productId={product.id} canReassignTemplate showCompleteness />,
    );
    const rendered = within(view.container);
    expect(await rendered.findByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Pastilla cerámica',
    );
    fireEvent.change(rendered.getByRole('textbox', { name: 'Descripción interna' }), {
      target: { value: 'Borrador sin guardar' },
    });
    fireEvent.click(rendered.getByRole('tab', { name: 'Aplicaciones' }));
    expect(await rendered.findByText('Toyota · Hilux')).toBeVisible();
    fireEvent.click(rendered.getByRole('tab', { name: 'Información técnica' }));

    expect(rendered.getByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Borrador sin guardar',
    );
    expect(patchProductAttributes).not.toHaveBeenCalled();
  });

  it('keeps missing required attributes and source information visible for purchasing without completeness or editing', async () => {
    const view = render(<ProductDetailView productId={product.id} showProductStatus />);
    const rendered = within(view.container);

    expect(await rendered.findByText('Fuente: Manual')).toBeInTheDocument();
    expect(
      rendered.getByRole('heading', { name: 'Atributos obligatorios faltantes' }),
    ).toBeInTheDocument();
    expect(
      rendered.queryByRole('heading', { name: 'Completitud de plantilla' }),
    ).not.toBeInTheDocument();
    expect(rendered.queryByRole('heading', { name: 'Control PIM' })).not.toBeInTheDocument();
    expect(
      rendered.queryByRole('button', { name: 'Editar enriquecimiento' }),
    ).not.toBeInTheDocument();
    expect(rendered.queryByRole('button', { name: 'Gestionar activos' })).not.toBeInTheDocument();
    expect(rendered.getByRole('tab', { name: 'Fuentes' })).toBeInTheDocument();
    expect(rendered.getByRole('tab', { name: 'Historial' })).toBeInTheDocument();
  });

  it('discards changes without closing the direct editor and keeps the clean editor across tabs', async () => {
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    });
    const view = render(
      <ProductDetailView productId={product.id} canReassignTemplate showCompleteness />,
    );
    const rendered = within(view.container);
    const input = await rendered.findByRole('textbox', { name: 'Descripción interna' });
    fireEvent.change(input, { target: { value: 'Cambio descartado' } });
    fireEvent.click(rendered.getByRole('button', { name: 'Descartar cambios' }));
    expect(input).toHaveValue('Pastilla cerámica');
    expect(rendered.getByRole('button', { name: 'Descartar cambios' })).toBeDisabled();
    expect(rendered.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(rendered.getByRole('region', { name: 'Guardar cambios de la ficha' })).toHaveTextContent(
      '0 cambios sin guardar',
    );
    fireEvent.click(rendered.getByRole('tab', { name: 'Aplicaciones' }));
    fireEvent.click(rendered.getByRole('tab', { name: 'Información técnica' }));
    expect(rendered.getByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Pastilla cerámica',
    );
    expect(patchProductAttributes).not.toHaveBeenCalled();
  });

  it('keeps inline drafts visible on a concurrency conflict and does not overwrite newer values', async () => {
    const { DynamicCatalogApiError } = await import('@/lib/dynamic-catalog-api');
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    });
    vi.mocked(patchProductAttributes).mockRejectedValue(
      new DynamicCatalogApiError('Conflict', 409),
    );
    const view = render(
      <ProductDetailView productId={product.id} canReassignTemplate showCompleteness />,
    );
    const rendered = within(view.container);
    expect(await rendered.findByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Pastilla cerámica',
    );
    fireEvent.change(rendered.getByRole('textbox', { name: 'Descripción interna' }), {
      target: { value: 'Valor en conflicto' },
    });
    fireEvent.click(rendered.getByRole('button', { name: 'Guardar cambios' }));

    expect(await rendered.findByRole('alert')).toHaveTextContent(
      'Otro usuario actualizó estos atributos',
    );
    expect(rendered.getByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Valor en conflicto',
    );
    expect(patchProductAttributes).toHaveBeenCalledTimes(1);
  });

  it('keeps administrator enrichment shortcuts in the existing draft and blocks subtype changes until it is resolved', async () => {
    const alternativeTemplateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    });
    vi.mocked(fetchCatalogCategories).mockResolvedValue([
      {
        id: sheet.schema.category.id,
        slug: sheet.schema.category.slug,
        name: sheet.schema.category.name,
        path: sheet.schema.category.name,
        templateId: sheet.schema.template.id,
        templateVariantKey: sheet.schema.template.variantKey,
        templateName: sheet.schema.template.name,
        templateVersion: 1,
      },
      {
        id: sheet.schema.category.id,
        slug: sheet.schema.category.slug,
        name: sheet.schema.category.name,
        path: sheet.schema.category.name,
        templateId: alternativeTemplateId,
        templateVariantKey: '15.2',
        templateName: 'Otra plantilla',
        templateVersion: 1,
      },
    ]);
    const view = render(
      <ProductDetailView productId={product.id} canReassignTemplate showCompleteness />,
    );
    const rendered = within(view.container);
    const selector = await rendered.findByRole('combobox', { name: 'Subtipo de plantilla' });
    expect(await rendered.findByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Pastilla cerámica',
    );
    fireEvent.change(rendered.getByRole('textbox', { name: 'Descripción interna' }), {
      target: { value: 'Borrador preservado' },
    });
    fireEvent.click(rendered.getByRole('button', { name: 'Editar enriquecimiento' }));

    expect(rendered.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rendered.getByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Borrador preservado',
    );
    expect(selector).toBeDisabled();
    fireEvent.change(selector, { target: { value: alternativeTemplateId } });
    expect(reassignProductTemplate).not.toHaveBeenCalled();
    expect(patchProductAttributes).not.toHaveBeenCalled();
    expect(rendered.getByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
      'Borrador preservado',
    );
    fireEvent.click(rendered.getByRole('button', { name: 'Descartar cambios' }));
    expect(selector).toBeEnabled();
  });

  it('opens enrichment deep links in the drawer while preserving variant context and real field permissions', async () => {
    window.history.replaceState(
      {},
      '',
      `/products/${product.id}?edit=enrichment&aplicacion=${applicationId}&idbar=b#ficha`,
    );
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    });
    const view = render(
      <ProductDetailView productId={product.id} canReassignTemplate showCompleteness />,
    );
    const rendered = within(view.container);

    const drawer = await rendered.findByRole('dialog', { name: product.sku });
    const editor = within(drawer);
    await waitFor(() =>
      expect(editor.getByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
        'Pastilla cerámica',
      ),
    );
    expect(
      editor.getByRole('heading', { name: 'Datos Base y Campos de Solo Lectura' }),
    ).toBeInTheDocument();
    expect(editor.queryByRole('textbox', { name: 'Código unificador' })).not.toBeInTheDocument();
    expect(window.location.search).not.toContain('edit=');
    expect(window.location.search).toContain(`aplicacion=${applicationId}`);
    expect(window.location.search).toContain('idbar=b');
    expect(window.location.hash).toBe('#ficha');
    expect(rendered.getByRole('tab', { name: 'Información técnica' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.change(editor.getByRole('textbox', { name: 'Descripción interna' }), {
      target: { value: 'Actualizada desde enriquecimiento' },
    });
    fireEvent.click(editor.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(patchProductAttributes).toHaveBeenCalledWith(product.id, {
        updates: [
          {
            attributeKey: 'descripcion_interna',
            value: 'Actualizada desde enriquecimiento',
            expectedVersion: 1,
          },
        ],
      }),
    );
    await waitFor(() => expect(rendered.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('contains keyboard focus in the enrichment drawer, closes with Escape and restores its opener', async () => {
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    });
    const view = render(<ProductDetailView productId={product.id} />);
    const rendered = within(view.container);
    const opener = await rendered.findByRole('button', { name: 'Editar enriquecimiento' });
    opener.focus();
    fireEvent.click(opener);
    const drawer = await rendered.findByRole('dialog', { name: product.sku });
    const editor = within(drawer);
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
    const first = editor.getByRole('button', { name: 'Cerrar' });
    const last = editor.getByRole('button', { name: 'Guardar cambios' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(rendered.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps the drawer open while a save is pending and closes it after success', async () => {
    let completeSave!: (result: Awaited<ReturnType<typeof patchProductAttributes>>) => void;
    vi.mocked(patchProductAttributes).mockImplementation(
      () =>
        new Promise((resolve) => {
          completeSave = resolve;
        }),
    );
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      schema: {
        ...sheet.schema,
        columns: sheet.schema.columns.map((column) =>
          column.sourceAuthority === 'pim'
            ? { ...column, permissions: { edit: true, import: true, export: true } }
            : column,
        ),
      },
    });
    const view = render(<ProductDetailView productId={product.id} />);
    const rendered = within(view.container);
    fireEvent.click(await rendered.findByRole('button', { name: 'Editar enriquecimiento' }));
    const editor = within(await rendered.findByRole('dialog', { name: product.sku }));
    await waitFor(() =>
      expect(editor.getByRole('textbox', { name: 'Descripción interna' })).toHaveValue(
        'Pastilla cerámica',
      ),
    );
    fireEvent.change(editor.getByRole('textbox', { name: 'Descripción interna' }), {
      target: { value: 'Actualizada' },
    });
    fireEvent.click(editor.getByRole('button', { name: 'Guardar cambios' }));
    expect(editor.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(rendered.getByRole('dialog')).toBeInTheDocument();
    completeSave({ productId: product.id, attributes: [] });
    await waitFor(() => expect(rendered.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('uses official readiness in both completeness meters while reporting visible coverage separately', async () => {
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({ ...sheet, completeness: 50 });
    const view = render(<ProductDetailView productId={product.id} showCompleteness />);
    const rendered = within(view.container);

    expect(
      await rendered.findByRole('progressbar', { name: `Completitud de ${product.sku}` }),
    ).toHaveAttribute('aria-valuenow', '50');
    expect(rendered.getByRole('progressbar', { name: 'Completitud de plantilla' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(rendered.getByText('Cobertura visible: 2/2 atributos con valor')).toBeInTheDocument();
  });

  it('preserves an official unmeasured score instead of falling back to an older product score', async () => {
    vi.mocked(fetchProduct).mockResolvedValue({ ...product, completeness: 85 });
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({ ...sheet, completeness: null });
    const view = render(<ProductDetailView productId={product.id} showCompleteness />);
    const rendered = within(view.container);
    await rendered.findByRole('heading', { name: experience.nombreGeneral, level: 1 });

    expect(
      rendered.queryByRole('progressbar', { name: `Completitud de ${product.sku}` }),
    ).not.toBeInTheDocument();
    expect(
      rendered.queryByRole('progressbar', { name: 'Completitud de plantilla' }),
    ).not.toBeInTheDocument();
  });

  it('reassigns an explicit template variant without changing the product category', async () => {
    const alternativeTemplateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    vi.mocked(fetchCatalogCategories).mockResolvedValue([
      {
        id: sheet.schema.category.id,
        slug: sheet.schema.category.slug,
        name: sheet.schema.category.name,
        path: sheet.schema.category.slug,
        templateId: sheet.schema.template.id,
        templateVariantKey: sheet.schema.template.variantKey,
        templateName: sheet.schema.template.name,
        templateVersion: sheet.schema.template.version,
      },
      {
        id: sheet.schema.category.id,
        slug: sheet.schema.category.slug,
        name: sheet.schema.category.name,
        path: sheet.schema.category.slug,
        templateId: alternativeTemplateId,
        templateVariantKey: '15.2',
        templateName: 'Plantilla pastillas cerámicas',
        templateVersion: 1,
      },
    ]);

    render(<ProductDetailView productId={product.id} canReassignTemplate />);

    const selector = await screen.findByRole('combobox', { name: 'Subtipo de plantilla' });
    fireEvent.change(selector, { target: { value: alternativeTemplateId } });

    await waitFor(() => {
      expect(reassignProductTemplate).toHaveBeenCalledWith(product.id, {
        templateId: alternativeTemplateId,
        expectedTemplateId: sheet.schema.template.id,
      });
    });
    expect(await screen.findByText(/Variante 15\.2/)).toBeInTheDocument();
  });
});
