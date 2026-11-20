import { createDefaultPdfDesignConfig, type ProductAttributeSheetDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProductTechnicalSheet } from '@/lib/dynamic-catalog-api';
import { fetchPdfDesignSettings } from '@/lib/pdf-design-api';
import { downloadTechnicalSheetPdf } from '@/lib/technical-sheet-export';
import type { Product } from '@/lib/types';
import { fetchUnifiedMembers } from '@/lib/unified-products';
import { SalesProductDetail } from './sales-product-detail';

const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('@/components/technical-sheet-preview', () => ({
  TechnicalSheetPreview: (props: unknown) => {
    mocks.preview(props);
    return null;
  },
}));
vi.mock('@/components/product-gallery', () => ({ ProductGallery: () => null }));
vi.mock('@/components/product-thumbnail', () => ({ ProductThumbnail: () => null }));
vi.mock('@/lib/unified-products', () => ({ fetchUnifiedMembers: vi.fn(async () => []) }));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchProductTechnicalSheet: vi.fn() }));
vi.mock('@/lib/product-assets-api', () => ({
  listProductAssets: vi.fn(async () => []),
  productAssetDownloadUrl: (id: string) => `/api/assets/${id}/download`,
}));
vi.mock('@/lib/pdf-design-api', () => ({ fetchPdfDesignSettings: vi.fn() }));
vi.mock('@/lib/technical-sheet-export', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  downloadTechnicalSheetPdf: vi.fn(),
  technicalSheetLogo: vi.fn(async () => new Uint8Array([9])),
  technicalSheetBrand: vi.fn(async () => ({ brandLogo: 'original-brand-logo' })),
  technicalSheetMedia: vi.fn(async () => []),
  technicalSheetCopy: vi.fn(async () => ({
    friendlyName: 'Nombre aprobado',
    description: 'Descripción comercial aprobada',
  })),
}));

const product: Product = {
  id: '33333333-3333-4333-8333-333333333333',
  sku: '6205',
  unifiedCode: '6205',
  name: 'Rodamiento',
  brand: 'SKF',
  category: 'Rodamientos',
  application: 'Industrial',
  status: 'published',
  completeness: 100,
  queryChannel: 'Catálogo',
  attributes: [],
};
const sheet: ProductAttributeSheetDto = {
  schema: {
    category: { id: '11111111-1111-4111-8111-111111111111', slug: 'rod', name: 'Rodamientos' },
    template: {
      id: '22222222-2222-4222-8222-222222222222',
      variantKey: '22.1',
      name: 'Plantilla rodamiento',
      version: 1,
    },
    columns: [],
  },
  product: {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    status: 'published',
    attributes: {},
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProductTechnicalSheet).mockResolvedValue(sheet);
  vi.mocked(fetchUnifiedMembers).mockResolvedValue([]);
});
afterEach(cleanup);
function renderDetail(currentProduct = product) {
  return render(
    <SalesProductDetail
      product={currentProduct}
      sheet={sheet}
      experience={null}
      assets={[]}
      applications={[]}
      homologs={[]}
      oemCodes={[]}
      onPick={() => {}}
    />,
  );
}

describe('Individual technical sheet downloads from the consultation view', () => {
  it('does not carry the original SKU description or attributes into an equivalent SKU preview', async () => {
    const memberId = '44444444-4444-4444-8444-444444444444';
    vi.mocked(fetchUnifiedMembers).mockResolvedValue([
      {
        id: memberId,
        sku: '6205-ALT',
        name: 'Rodamiento alternativo',
        brand: 'FAG',
        description: null,
        status: 'published',
        updatedAt: '2026-11-20T14:00:00.000Z',
        category: null,
        template: null,
        providerCode: 'ALT-PROVIDER',
        unifiedCode: '6205',
        applicationTypes: [],
        completeness: null,
        attributes: {},
      },
    ]);
    vi.mocked(fetchProductTechnicalSheet).mockResolvedValue({
      ...sheet,
      product: {
        ...sheet.product,
        id: memberId,
        sku: '6205-ALT',
        name: 'Rodamiento alternativo',
        brand: 'FAG',
      },
    });
    renderDetail({
      ...product,
      description: 'Texto exclusivo del SKU original',
      providerCode: 'ORIGINAL',
      attributes: [
        {
          key: 'original',
          label: 'Original',
          value: 'Privado original',
          rawValue: 'Privado original',
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver ficha técnica de 6205-ALT' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalled());
    expect(mocks.preview.mock.calls.at(-1)![0].product).toMatchObject({
      id: memberId,
      sku: '6205-ALT',
      name: 'Rodamiento alternativo',
      brand: 'FAG',
      attributes: [],
    });
    expect(mocks.preview.mock.calls.at(-1)![0].product.description).toBeUndefined();
    expect(mocks.preview.mock.calls.at(-1)![0].product.providerCode).toBeUndefined();
  });
  it('uses the saved template design and shared branding just like the preview and ZIP', async () => {
    const config = createDefaultPdfDesignConfig();
    config.templateRules = [
      {
        templateId: sheet.schema.template.id,
        designId: 'compacta',
        hiddenSections: ['docs'],
        sectionTitles: { car: 'Datos del cliente' },
      },
    ];
    config.cdrLogoDataUrl = 'data:image/png;base64,AQID';
    config.brandLogos = [{ brand: product.brand, dataUrl: 'data:image/png;base64,BAUG' }];
    vi.mocked(fetchPdfDesignSettings).mockResolvedValue({
      config,
      updatedAt: '2026-11-20T14:00:00.000Z',
    });
    renderDetail();
    fireEvent.click(
      screen.getByRole('button', { name: `Descargar ficha técnica de ${product.sku}` }),
    );
    await waitFor(() => expect(downloadTechnicalSheetPdf).toHaveBeenCalledOnce());
    expect(fetchPdfDesignSettings).toHaveBeenCalledOnce();
    expect(downloadTechnicalSheetPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: product.sku,
        design: config.designs.find((design) => design.id === 'compacta'),
        templateRule: config.templateRules[0],
        cdrLogo: new Uint8Array([1, 2, 3]),
        brandLogo: 'data:image/png;base64,BAUG',
        customFonts: config.fonts,
        description: 'Descripción comercial aprobada',
        friendlyName: 'Nombre aprobado',
      }),
    );
  });

  it('reports a settings failure and avoids downloading a document with a different design', async () => {
    vi.mocked(fetchPdfDesignSettings).mockRejectedValue(new Error('Diseño no disponible'));
    renderDetail();
    fireEvent.click(
      screen.getByRole('button', { name: `Descargar ficha técnica de ${product.sku}` }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Diseño no disponible');
    expect(downloadTechnicalSheetPdf).not.toHaveBeenCalled();
  });
});
