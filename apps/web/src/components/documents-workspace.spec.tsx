import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentsWorkspace } from '@/components/documents-workspace';

const mocks = vi.hoisted(() => ({
  listProductAssets: vi.fn(),
  uploadProductAsset: vi.fn(),
  processProductAssetZip: vi.fn(),
  deleteProductAsset: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: () => <span data-testid="mock-image" />,
}));

vi.mock('@/components/use-products-data', () => ({
  useProductsData: () => ({
    products: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        sku: '6205-2RS1',
        name: 'Rodamiento 6205',
        brand: 'FAG',
        category: 'Rodamientos',
        application: 'Industrial',
        status: 'draft',
        completeness: 70,
        attributes: [],
      },
    ],
    total: 1,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('@/lib/product-assets-api', () => ({
  listProductAssets: mocks.listProductAssets,
  uploadProductAsset: mocks.uploadProductAsset,
  processProductAssetZip: mocks.processProductAssetZip,
  deleteProductAsset: mocks.deleteProductAsset,
  productAssetDownloadUrl: (id: string) => `/api/operations/assets/${id}/download`,
}));

const asset = {
  id: '11111111-1111-4111-8111-111111111111',
  productId: '22222222-2222-4222-8222-222222222222',
  sku: '6205-2RS1',
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
} as const;

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/documents');
  mocks.listProductAssets.mockResolvedValue([asset]);
  mocks.uploadProductAsset.mockResolvedValue(asset);
  mocks.processProductAssetZip.mockResolvedValue({
    mode: 'validate',
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
        status: 'ready',
        message: null,
        asset: null,
      },
    ],
  });
});

describe('DocumentsWorkspace', () => {
  it('renders only persisted assets and enables the individual workflow', async () => {
    render(<DocumentsWorkspace canWrite />);
    expect(await screen.findByText(asset.filename)).toBeVisible();
    expect(screen.getByRole('button', { name: /Subir activo/i })).toBeEnabled();
    expect(screen.queryByText(/API de activos aún no está aprobada/i)).not.toBeInTheDocument();

    const file = new File(['%PDF-1.7'], 'ficha.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Archivo', { exact: true }), {
      target: { files: [file] },
    });
    const submit = screen.getByRole('button', { name: 'Subir y asociar' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.submit(submit.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(mocks.uploadProductAsset).toHaveBeenCalledWith(
        expect.objectContaining({ productId: asset.productId, type: 'FT', file }),
      ),
    );
  });

  it('previews a ZIP before enabling confirmation', async () => {
    render(<DocumentsWorkspace canWrite />);
    await screen.findByText(asset.filename);
    const zip = new File(['zip'], 'documentos.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Archivo ZIP'), { target: { files: [zip] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar ZIP' }));
    await waitFor(() => expect(mocks.processProductAssetZip).toHaveBeenCalledWith(zip, 'validate'));
    expect(
      await screen.findByRole('button', { name: /Confirmar carga · 1 archivo/ }),
    ).toBeEnabled();
  });

  it('keeps downloads visible but hides mutations for a read-only actor', async () => {
    render(<DocumentsWorkspace canWrite={false} />);

    expect(await screen.findByText(asset.filename)).toBeVisible();
    expect(screen.getByText(/Acceso de solo lectura/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /Descargar/i })).toHaveAttribute(
      'href',
      `/api/operations/assets/${asset.id}/download`,
    );
    expect(screen.queryByRole('button', { name: /Subir activo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Carga masiva/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/i })).not.toBeInTheDocument();
    expect(mocks.uploadProductAsset).not.toHaveBeenCalled();
    expect(mocks.deleteProductAsset).not.toHaveBeenCalled();
  });

  it('preserves product detail context even when it is outside the first catalog page', async () => {
    const requestedProductId = '33333333-3333-4333-8333-333333333333';
    window.history.replaceState({}, '', `/documents?productId=${requestedProductId}`);

    render(<DocumentsWorkspace canWrite />);

    await waitFor(() =>
      expect(mocks.listProductAssets).toHaveBeenCalledWith(
        { productId: requestedProductId },
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByRole('option', { name: /Producto seleccionado/i })).toHaveValue(
      requestedProductId,
    );
  });
});
