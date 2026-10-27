import type {
  CatalogWorkbookProductDto,
  ProductAssetDto,
  ProductAttributeSheetDto,
  WorkspaceDto,
} from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchCatalogWorkbook, fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';
import { listProductAssets } from '@/lib/product-assets-api';

import { CatalogQualityWorkspace } from './catalog-quality-workspace';

vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogWorkbook: vi.fn(),
  fetchProductAttributeSheet: vi.fn(),
}));
vi.mock('@/lib/product-assets-api', () => ({
  listProductAssets: vi.fn(),
  productAssetDownloadUrl: (id: string) => `/assets/${id}`,
}));

const first: CatalogWorkbookProductDto = {
  id: '11111111-1111-4111-8111-111111111111',
  sku: '6205',
  name: 'Rodamiento',
  description: null,
  brand: 'FAG',
  status: 'in_review',
  updatedAt: '2026-10-22T10:00:00Z',
  category: { id: '22222222-2222-4222-8222-222222222222', name: 'Rodamientos' },
  template: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Bolas rígidas',
    variantKey: '14',
    version: 1,
  },
  providerCode: null,
  unifiedCode: null,
  applicationTypes: [],
  completeness: 67,
  attributes: {},
};
const second: CatalogWorkbookProductDto = {
  ...first,
  id: '44444444-4444-4444-8444-444444444444',
  sku: '6301',
};
const columns = ['carga', 'sellado', 'material'].map((key, index) => ({
  id: `attr-${index}`,
  key,
  label: ['Carga', 'Sellado', 'Material'][index]!,
  dataType:
    key === 'carga'
      ? ('number' as const)
      : key === 'sellado'
        ? ('boolean' as const)
        : ('text' as const),
  unit: null,
  allowedValues: [],
  required: true,
  replicable: false,
  searchable: true,
  includeInTechnicalSheet: true,
  sourceAuthority: 'pim' as const,
  position: index,
  permissions: { edit: true, import: true, export: true },
}));
const sheet: ProductAttributeSheetDto & {
  assetRequirements: { type: 'FT' | 'FOTO'; required: boolean }[];
} = {
  schema: {
    category: { ...first.category!, slug: 'rodamientos' },
    template: first.template!,
    columns,
  },
  product: {
    id: first.id,
    sku: first.sku,
    name: first.name,
    brand: first.brand,
    status: first.status,
    attributes: {
      carga: { value: 0, version: 1, source: 'manual', updatedAt: first.updatedAt },
      sellado: { value: false, version: 1, source: 'manual', updatedAt: first.updatedAt },
      material: { value: '   ', version: 1, source: 'manual', updatedAt: first.updatedAt },
    },
  },
  completeness: 50,
  assetRequirements: [
    { type: 'FT', required: true },
    { type: 'FOTO', required: false },
  ],
};
const workspace: WorkspaceDto = {
  slug: 'quality',
  generatedAt: first.updatedAt,
  operationalStatus: 'operational',
  metrics: [],
  columns: [],
  rows: [],
  totalRows: 0,
  notices: [],
  actions: [],
};

beforeEach(() => {
  window.history.replaceState({}, '', '/quality?view=quality');
  vi.clearAllMocks();
  vi.mocked(fetchCatalogWorkbook).mockResolvedValue({
    items: [first, second],
    columns: [],
    facets: { brands: [], statuses: [], applicationTypes: [] },
    page: 1,
    pageSize: 25,
    total: 105,
  });
  vi.mocked(fetchProductAttributeSheet).mockResolvedValue(sheet);
  vi.mocked(listProductAssets).mockResolvedValue([]);
});
afterEach(cleanup);

describe('CatalogQualityWorkspace', () => {
  it('opens an exact product context outside the first search page without loading every sheet', async () => {
    window.history.replaceState({}, '', `/quality?view=quality&productId=${second.id}`);
    vi.mocked(fetchCatalogWorkbook).mockResolvedValue({
      items: [first],
      columns: [],
      facets: { brands: [], statuses: [], applicationTypes: [] },
      page: 1,
      pageSize: 25,
      total: 105,
    });
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({
      ...sheet,
      product: { ...sheet.product, id: second.id, sku: second.sku },
    });
    render(<CatalogQualityWorkspace workspace={workspace} />);
    // The selected summary can render before the detail effect starts loading assets.
    // Wait for the evaluated attributes table, which requires both requests to settle.
    await screen.findByRole('table');
    expect(screen.getByText('6301 · 50% completo')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU en contexto')).toHaveValue(second.id);
    expect(fetchProductAttributeSheet).toHaveBeenCalledTimes(1);
    expect(fetchProductAttributeSheet).toHaveBeenCalledWith(second.id, expect.any(AbortSignal));
    expect(listProductAssets).toHaveBeenCalledWith(
      { productId: second.id },
      expect.any(AbortSignal),
    );
  });
  it('loads only the selected SKU and uses official completeness including document requirements', async () => {
    render(<CatalogQualityWorkspace workspace={workspace} />);
    const table = await screen.findByRole('table');
    expect(screen.getByText('6205 · 50% completo')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(within(table).getByText('0')).toBeInTheDocument();
    expect(within(table).getByText('No')).toBeInTheDocument();
    expect(screen.getByText('1 faltantes')).toBeInTheDocument();
    expect(screen.getByText('No publicable')).toBeInTheDocument();
    expect(screen.getByText('Sin evaluar', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Completar' })).toHaveAttribute(
      'href',
      `/products/${first.id}?edit=enrichment`,
    );
    expect(fetchProductAttributeSheet).toHaveBeenCalledTimes(1);
    expect(listProductAssets).toHaveBeenCalledTimes(1);
    expect(fetchCatalogWorkbook).toHaveBeenCalledWith(
      { page: 1, pageSize: 25, filter: [] },
      expect.any(AbortSignal),
    );
    fireEvent.change(screen.getByLabelText('SKU en contexto'), { target: { value: second.id } });
    await waitFor(() => expect(fetchProductAttributeSheet).toHaveBeenCalledTimes(2));
    expect(fetchProductAttributeSheet).toHaveBeenLastCalledWith(second.id, expect.any(AbortSignal));
  });

  it('does not assume missing metadata means no required documents or conflict-free publication', async () => {
    const { assetRequirements: _requirements, ...legacy } = sheet;
    vi.mocked(fetchProductAttributeSheet).mockResolvedValue({ ...legacy, completeness: 100 });
    render(<CatalogQualityWorkspace workspace={workspace} />);
    await screen.findByRole('table');
    expect(screen.getByText('6205 · 100% completo')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de evaluación')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Los requisitos documentales de esta plantilla no están disponibles para consulta.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('0 faltantes')).not.toBeInTheDocument();
  });

  it('checks a required document against actual assets and links to its download', async () => {
    vi.mocked(listProductAssets).mockResolvedValue([
      { id: 'file-id', type: 'FT', filename: 'ficha.pdf' } as ProductAssetDto,
    ]);
    render(<CatalogQualityWorkspace workspace={workspace} />);
    expect(await screen.findByRole('link', { name: 'ficha.pdf' })).toHaveAttribute(
      'href',
      '/assets/file-id',
    );
    expect(screen.getByText('0 faltantes')).toBeInTheDocument();
    expect(screen.getByText('Opcional')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reglas de calidad' }));
    expect(screen.getByRole('dialog', { name: 'Reglas de calidad' })).toHaveTextContent(
      'Los valores cero y No son datos completos.',
    );
  });

  it('keeps unclassified products accessible without asking for a nonexistent sheet', async () => {
    vi.mocked(fetchCatalogWorkbook).mockResolvedValue({
      items: [{ ...first, template: null, category: null, completeness: null }],
      columns: [],
      facets: { brands: [], statuses: [], applicationTypes: [] },
      page: 1,
      pageSize: 25,
      total: 1,
    });
    render(<CatalogQualityWorkspace workspace={workspace} />);
    await screen.findByText(
      'El producto necesita una categoría y una plantilla activas para evaluar sus requisitos.',
    );
    expect(fetchProductAttributeSheet).not.toHaveBeenCalled();
    expect(listProductAssets).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Editar enriquecimiento' })).toHaveAttribute(
      'href',
      `/products/${first.id}?edit=enrichment`,
    );
  });
});
