import type {
  CatalogWorkbookProductDto,
  ProductAssetBulkResultDto,
  ProductAssetDto,
} from '@cdr/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DocumentsView from '@/lib/documents-view';

const mocks = vi.hoisted(() => ({
  fetchDocumentsCatalog: vi.fn(),
  fetchCatalogCategories: vi.fn(),
  fetchProduct: vi.fn(),
  uploadProductAsset: vi.fn(),
  processProductAssetZip: vi.fn(),
  deleteProductAsset: vi.fn(),
  exportXlsx: vi.fn(),
  listProductAssetsBatch: vi.fn(),
  fetchCatalogWorkbook: vi.fn(),
}));
vi.mock('next/image', () => ({ default: () => <span data-testid="mock-image" /> }));
vi.mock('@/lib/documents-view', async (original) => ({
  ...(await original<typeof DocumentsView>()),
  fetchDocumentsCatalog: mocks.fetchDocumentsCatalog,
}));
vi.mock('@/lib/product-assets-api', () => ({
  listProductAssetsBatch: mocks.listProductAssetsBatch,
  uploadProductAsset: mocks.uploadProductAsset,
  processProductAssetZip: mocks.processProductAssetZip,
  deleteProductAsset: mocks.deleteProductAsset,
  productAssetDownloadUrl: (id: string) => `/api/operations/assets/${id}/download`,
}));
vi.mock('@/lib/catalog-api', () => ({ fetchProduct: mocks.fetchProduct }));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogCategories: mocks.fetchCatalogCategories,
  fetchCatalogWorkbook: mocks.fetchCatalogWorkbook,
}));
vi.mock('@/lib/tabular-export', () => ({ downloadXlsx: mocks.exportXlsx }));

import { DocumentsWorkspace } from '@/components/documents-workspace';

const product: CatalogWorkbookProductDto = {
  id: '22222222-2222-4222-8222-222222222222',
  sku: '6205-2RS1',
  name: 'Rodamiento 6205',
  description: null,
  brand: 'FAG',
  status: 'draft',
  updatedAt: '2026-10-07T10:00:00.000Z',
  category: { id: '44444444-4444-4444-8444-444444444444', name: 'Rodamientos' },
  template: {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Rodamiento',
    variantKey: 'default',
    version: 1,
  },
  providerCode: '6205-2RS/C3',
  unifiedCode: '6205-2RS',
  applicationTypes: ['INDUSTRIAL'],
  completeness: 70,
  attributes: {},
  assetRequirements: [
    { type: 'FOTO', required: true },
    { type: 'PLANO', required: false },
    { type: 'FT', required: true },
  ],
};
const asset: ProductAssetDto = {
  id: '11111111-1111-4111-8111-111111111111',
  productId: product.id,
  sku: product.sku,
  kind: 'document',
  type: 'FT',
  filename: '6205-2RS1__FT.pdf',
  mimeType: 'application/pdf',
  size: 100,
  checksum: 'checksum',
  position: null,
  source: 'manual',
  uploadedBy: 'user-1',
  uploadedAt: '2026-10-07T10:00:00.000Z',
  replacesAssetId: null,
};
const second: CatalogWorkbookProductDto = {
  ...product,
  id: '33333333-3333-4333-8333-333333333333',
  sku: 'RET-104',
  name: 'Retén 30 × 45 × 7',
  brand: 'Corteco',
  providerCode: 'RET-PROVIDER',
  unifiedCode: null,
  assetRequirements: [{ type: 'FT', required: true }],
};
const unclassified: CatalogWorkbookProductDto = {
  ...second,
  id: '66666666-6666-4666-8666-666666666666',
  sku: 'RET-045',
  template: null,
  category: null,
  assetRequirements: [],
  completeness: null,
};
const rowFor = (sku: string) =>
  screen.getByRole('link', { name: sku }).closest('tr') as HTMLTableRowElement;
const allCatalog = () => ({
  products: [product, second, unclassified],
  assets: { [product.id]: [asset] },
});

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', '/documents');
  mocks.fetchDocumentsCatalog.mockResolvedValue(allCatalog());
  mocks.fetchCatalogCategories.mockResolvedValue([]);
  mocks.uploadProductAsset.mockResolvedValue(asset);
  mocks.processProductAssetZip.mockImplementation(async (_file: File, mode: string) => ({
    mode,
    archiveName: 'documentos.zip',
    total: 1,
    valid: 1,
    errors: 0,
    affectedSkus: 1,
    items: [
      {
        filename: asset.filename,
        sku: asset.sku,
        type: asset.type,
        status: mode === 'validate' ? 'ready' : 'uploaded',
        message: null,
        asset: mode === 'validate' ? null : asset,
      },
    ],
  }));
});
afterEach(cleanup);

describe('DocumentsWorkspace', () => {
  it('shows required, optional, present and non-applicable slots from real template metadata', async () => {
    render(<DocumentsWorkspace canWrite />);
    expect(await screen.findByText(asset.filename)).toBeVisible();
    const row = rowFor(product.sku);
    expect(within(row).getByText('Obligatorio')).toBeVisible();
    expect(within(row).getByText('Pendiente')).toBeVisible();
    expect(within(row).getAllByText('No aplica')).toHaveLength(2);
    expect(within(row).getByText('1/3')).toBeVisible();
    expect(within(row).getByText(product.providerCode!)).toBeVisible();
    expect(within(row).getByLabelText(`Cargar Ficha técnica de ${product.sku}`)).toBeVisible();
    expect(
      within(row).queryByLabelText(`Cargar Certificado de ${product.sku}`),
    ).not.toBeInTheDocument();
    const noApplyCell = within(row).getAllByText('No aplica').at(-1)!.closest('td')!;
    fireEvent.drop(noApplyCell, {
      dataTransfer: { files: [new File(['%PDF-1.7'], 'cert.pdf', { type: 'application/pdf' })] },
    });
    expect(mocks.uploadProductAsset).not.toHaveBeenCalled();
    const pending = rowFor(unclassified.sku);
    expect(within(pending).getAllByText('Sin plantilla activa')).toHaveLength(5);
    expect(pending.querySelector('input[type="file"]')).toBeNull();
  });

  it('uploads from the matching persisted FT slot and refreshes the whole catalog', async () => {
    render(<DocumentsWorkspace canWrite />);
    await screen.findByText(asset.filename);
    const file = new File(['%PDF-1.7'], 'ficha.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(`Cargar Ficha técnica de ${product.sku}`), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(mocks.uploadProductAsset).toHaveBeenCalledWith({
        productId: product.id,
        type: 'FT',
        file,
      }),
    );
    await waitFor(() => expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledTimes(2));
  });

  it('uploads a dropped optional document using its own SKU and type', async () => {
    render(<DocumentsWorkspace canWrite />);
    await screen.findByText(asset.filename);
    const file = new File(['%PDF-1.7'], 'plano.pdf', { type: 'application/pdf' });
    const cell = screen.getByLabelText(`Cargar Plano de ${product.sku}`).closest('td')!;
    fireEvent.drop(cell, { dataTransfer: { files: [file] } });
    await waitFor(() =>
      expect(mocks.uploadProductAsset).toHaveBeenCalledWith({
        productId: product.id,
        type: 'PLANO',
        file,
      }),
    );
  });

  it('protects both parallel upload slots until each request settles, including after a catalog reload', async () => {
    let finishFt!: (value: ProductAssetDto) => void;
    let finishPlan!: (value: ProductAssetDto) => void;
    const ftPending = new Promise<ProductAssetDto>((resolve) => {
      finishFt = resolve;
    });
    const planPending = new Promise<ProductAssetDto>((resolve) => {
      finishPlan = resolve;
    });
    mocks.uploadProductAsset.mockImplementation(({ type }: { type: string }) =>
      type === 'FT' ? ftPending : planPending,
    );
    render(<DocumentsWorkspace canWrite />);
    await screen.findByText(asset.filename);
    const ftLabel = `Cargar Ficha técnica de ${product.sku}`;
    const planLabel = `Cargar Plano de ${product.sku}`;
    fireEvent.change(screen.getByLabelText(ftLabel), {
      target: { files: [new File(['%PDF-1.7'], 'ft.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(screen.getByLabelText(planLabel), {
      target: { files: [new File(['%PDF-1.7'], 'plan.pdf', { type: 'application/pdf' })] },
    });
    expect(mocks.uploadProductAsset).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(ftLabel)).toBeDisabled();
    expect(screen.getByLabelText(planLabel)).toBeDisabled();

    await act(async () => {
      finishFt(asset);
      await ftPending;
    });
    await waitFor(() => expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledTimes(2));
    const pendingPlan = await screen.findByLabelText(planLabel);
    expect(pendingPlan).toBeDisabled();
    expect(screen.getByLabelText(ftLabel)).toBeEnabled();
    fireEvent.change(pendingPlan, {
      target: {
        files: [new File(['%PDF-1.7'], 'duplicate-plan.pdf', { type: 'application/pdf' })],
      },
    });
    expect(mocks.uploadProductAsset).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishPlan({
        ...asset,
        id: '11111111-1111-4111-8111-111111111112',
        type: 'PLANO',
        filename: '6205-2RS1__PLANO.pdf',
      });
      await planPending;
    });
    await waitFor(() => expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledTimes(3));
    expect(await screen.findByLabelText(planLabel)).toBeEnabled();
    expect(screen.getByLabelText(ftLabel)).toBeEnabled();
  });

  it('keeps downloads and export available while a read-only actor has no file mutations', async () => {
    const { container } = render(<DocumentsWorkspace canWrite={false} />);
    await screen.findByText(asset.filename);
    expect(screen.getByText(/^Acceso de solo lectura:/i)).toBeVisible();
    expect(screen.getByRole('link', { name: `Descargar ${asset.filename}` })).toHaveAttribute(
      'href',
      `/api/operations/assets/${asset.id}/download`,
    );
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Carga masiva/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ZIP de ejemplo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    const cell = screen.getByText(asset.filename).closest('td')!;
    fireEvent.drop(cell, {
      dataTransfer: { files: [new File(['pdf'], 'replacement.pdf', { type: 'application/pdf' })] },
    });
    expect(mocks.uploadProductAsset).not.toHaveBeenCalled();
    expect(mocks.deleteProductAsset).not.toHaveBeenCalled();
  });

  it('opens ZIP explicitly and requires validation before confirmation', async () => {
    render(<DocumentsWorkspace canWrite />);
    await screen.findByText(asset.filename);
    expect(screen.queryByLabelText('Archivo ZIP')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carga masiva (ZIP)' }));
    const drawer = screen.getByRole('dialog', { name: 'Carga masiva de documentos e imágenes' });
    expect(
      within(drawer).queryByRole('button', { name: /Confirmar carga/ }),
    ).not.toBeInTheDocument();
    const zip = new File(['zip'], 'documentos.zip', { type: 'application/zip' });
    fireEvent.change(within(drawer).getByLabelText('Archivo ZIP'), { target: { files: [zip] } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Validar ZIP' }));
    await waitFor(() => expect(mocks.processProductAssetZip).toHaveBeenCalledWith(zip, 'validate'));
    expect(mocks.processProductAssetZip).not.toHaveBeenCalledWith(zip, 'commit');
    fireEvent.click(
      await within(drawer).findByRole('button', { name: 'Confirmar carga · 1 archivo' }),
    );
    await waitFor(() => expect(mocks.processProductAssetZip).toHaveBeenCalledWith(zip, 'commit'));
    await waitFor(() => expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledTimes(2));
  });

  it('locks the ZIP during validation and commits only the same reviewed file', async () => {
    let resolveValidation!: (result: ProductAssetBulkResultDto) => void;
    const validation = new Promise<ProductAssetBulkResultDto>((resolve) => {
      resolveValidation = resolve;
    });
    mocks.processProductAssetZip.mockImplementationOnce(() => validation);
    const zipA = new File(['zip-a'], 'documentos-A.zip', { type: 'application/zip' });
    const zipB = new File(['zip-b'], 'documentos-B.zip', { type: 'application/zip' });

    render(<DocumentsWorkspace canWrite />);
    await screen.findByText(asset.filename);
    fireEvent.click(screen.getByRole('button', { name: 'Carga masiva (ZIP)' }));
    const drawer = screen.getByRole('dialog', { name: 'Carga masiva de documentos e imágenes' });
    const input = within(drawer).getByLabelText('Archivo ZIP');
    fireEvent.change(input, { target: { files: [zipA] } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Validar ZIP' }));
    expect(input).toBeDisabled();
    expect(mocks.processProductAssetZip).toHaveBeenNthCalledWith(1, zipA, 'validate');

    // A dispatched change must not replace the file that is currently being reviewed.
    fireEvent.change(input, { target: { files: [zipB] } });
    await act(async () => {
      resolveValidation({
        mode: 'validate',
        archiveName: zipA.name,
        total: 1,
        valid: 1,
        errors: 0,
        affectedSkus: 1,
        items: [
          {
            filename: asset.filename,
            sku: asset.sku,
            type: asset.type,
            status: 'ready',
            message: null,
            asset: null,
          },
        ],
      });
      await validation;
    });
    expect(input).toBeEnabled();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Confirmar carga · 1 archivo' }));
    await waitFor(() => {
      expect(mocks.processProductAssetZip).toHaveBeenNthCalledWith(2, zipA, 'commit');
      expect(mocks.processProductAssetZip.mock.calls[1]![0]).toBe(zipA);
      expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledTimes(2);
    });

    fireEvent.change(input, { target: { files: [zipB] } });
    expect(
      within(drawer).queryByRole('button', { name: /Confirmar carga/ }),
    ).not.toBeInTheDocument();
    expect(mocks.processProductAssetZip).toHaveBeenCalledTimes(2);
    fireEvent.click(within(drawer).getByRole('button', { name: 'Validar ZIP' }));
    fireEvent.click(
      await within(drawer).findByRole('button', { name: 'Confirmar carga · 1 archivo' }),
    );
    await waitFor(() => {
      expect(mocks.processProductAssetZip).toHaveBeenNthCalledWith(3, zipB, 'validate');
      expect(mocks.processProductAssetZip).toHaveBeenNthCalledWith(4, zipB, 'commit');
    });
  });

  it('preserves a deep SKU context beyond the first hundred rows without fetching another product', async () => {
    const products = Array.from({ length: 104 }, (_, index) => ({
      ...product,
      id: `item-${index}`,
      sku: `SKU-${index}`,
    }));
    mocks.fetchDocumentsCatalog.mockResolvedValue({ products: [...products, second], assets: {} });
    window.history.replaceState({}, '', `/documents?productId=${second.id}`);
    render(<DocumentsWorkspace canWrite />);
    const selector = await screen.findByRole('combobox', { name: 'SKU en contexto' });
    expect(selector).toHaveValue(second.id);
    expect(screen.getByRole('tab', { name: `SKU en contexto · ${second.sku}` })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(selector).getAllByRole('option')).toHaveLength(105);
    expect(screen.getByRole('link', { name: 'Ver ficha del producto →' })).toHaveAttribute(
      'href',
      `/products/${second.id}`,
    );
    expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.fetchProduct).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: /Todos los SKU/ }));
    expect(await screen.findByRole('link', { name: second.sku })).toBeVisible();
    expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledTimes(1);
  });

  it('applies AX empty and wildcard filters to the same complete rows it exports', async () => {
    const products = Array.from({ length: 104 }, (_, index) => ({
      ...product,
      id: `item-${index}`,
      sku: `SKU-${String(index).padStart(3, '0')}`,
      assetRequirements: product.assetRequirements,
    }));
    mocks.fetchDocumentsCatalog.mockResolvedValue({ products: [...products, second], assets: {} });
    render(<DocumentsWorkspace canWrite={false} />);
    await screen.findByRole('link', { name: second.sku });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(mocks.exportXlsx.mock.calls[0]![0].rows).toHaveLength(105);
    expect(mocks.exportXlsx.mock.calls[0]![0].rows.at(-1)[0]).toBe(second.sku);
    fireEvent.change(screen.getByLabelText('Filtrar Código artículo (sintaxis AX)'), {
      target: { value: 'RET-*' },
    });
    fireEvent.change(screen.getByLabelText('Filtrar Ficha técnica (sintaxis AX)'), {
      target: { value: '""' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    const exported = mocks.exportXlsx.mock.calls[1]![0];
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0][0]).toBe(second.sku);
    expect(exported.headers).toContain('Ficha técnica');
    expect(exported.rows[0][exported.headers.indexOf('Ficha técnica')]).toBe('Obligatorio');
    expect(screen.queryByRole('link', { name: 'SKU-000' })).not.toBeInTheDocument();
  });

  it('switches table and contextual slots without discarding the selected SKU or making extra catalog requests', async () => {
    render(<DocumentsWorkspace canWrite />);
    await screen.findByText(asset.filename);
    fireEvent.click(screen.getByRole('tab', { name: /SKU en contexto/ }));
    const selector = screen.getByRole('combobox', { name: 'SKU en contexto' });
    fireEvent.change(selector, { target: { value: second.id } });
    expect(window.location.search).toContain(`productId=${second.id}`);
    expect(screen.getByRole('link', { name: 'Ver ficha del producto →' })).toHaveAttribute(
      'href',
      `/products/${second.id}`,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Todos los SKU/ }));
    fireEvent.click(screen.getByRole('tab', { name: /SKU en contexto/ }));
    expect(screen.getByRole('combobox', { name: 'SKU en contexto' })).toHaveValue(second.id);
    expect(mocks.fetchDocumentsCatalog).toHaveBeenCalledTimes(1);
  });
});
