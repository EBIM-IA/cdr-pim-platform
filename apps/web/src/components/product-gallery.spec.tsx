import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductAssetDto } from '@cdr/contracts';
import { ProductGallery } from './product-gallery';
import {
  listProductAssets,
  reorderProductAssets,
  uploadProductAsset,
} from '@/lib/product-assets-api';
vi.mock('@/lib/product-assets-api', () => ({
  listProductAssets: vi.fn(),
  reorderProductAssets: vi.fn(),
  uploadProductAsset: vi.fn(),
  deleteProductAsset: vi.fn(),
  productAssetDownloadUrl: (id: string) => `/api/assets/${id}`,
}));
const photo = {
  id: 'photo',
  type: 'FOTO',
  filename: 'Foto del cliente.jpg',
  mimeType: 'image/jpeg',
  position: 1,
} as ProductAssetDto;
const second = { ...photo, id: 'second', filename: 'Segunda.jpg', position: 2 };
const plan = {
  id: 'plan',
  type: 'PLANO',
  filename: 'Plano.pdf',
  mimeType: 'application/pdf',
  position: 1,
} as ProductAssetDto;
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
describe('ProductGallery', () => {
  it('keeps photos separate, navigates with thumbnails and keyboard, and falls back when every photo fails', () => {
    render(
      <ProductGallery
        name="Rodamiento 6205"
        category="Rodamientos"
        assets={[photo, second, plan]}
        attributes={[]}
      />,
    );
    expect(screen.getByRole('img', { name: /Rodamiento 6205 · Foto/u })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente' }));
    expect(screen.getByRole('img', { name: /Rodamiento 6205 · Segunda/u })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Galería del producto' }), {
      key: 'ArrowRight',
    });
    const image = screen.getByRole('img', { name: /Rodamiento 6205 · Foto/u });
    fireEvent.error(image);
    expect(
      screen.queryByRole('button', { name: 'Ver Foto del cliente.jpg' }),
    ).not.toBeInTheDocument();
    fireEvent.error(screen.getByRole('img', { name: /Rodamiento 6205 · Segunda/u }));
    expect(screen.getByRole('img', { name: /Ilustración referencial/u })).toBeVisible();
    expect(screen.queryByText('Plano.pdf')).not.toBeInTheDocument();
  });
  it('shows a PDF plan as a document and leaves the technical drawing at the end', () => {
    render(
      <ProductGallery
        name="Rodamiento"
        category="Rodamientos"
        assets={[photo, plan]}
        attributes={[]}
        type="PLANO"
      />,
    );
    expect(screen.getByRole('link', { name: 'Abrir o descargar plano' })).toHaveAttribute(
      'href',
      '/api/assets/plan',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente' }));
    expect(screen.getByRole('img', { name: /Ilustración referencial/u })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Opciones/u })).not.toBeInTheDocument();
  });
  it('opens an accessible viewer, zooms and closes with Escape', () => {
    render(
      <ProductGallery
        name="Rodamiento"
        category="Rodamientos"
        assets={[photo, second]}
        attributes={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar imagen' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Visor de fotografías' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Aumentar zoom' }));
    expect(dialog.getByRole('button', { name: 'Restablecer zoom' })).toHaveTextContent('150%');
    fireEvent.click(dialog.getByRole('button', { name: 'Siguiente en visor' }));
    expect(dialog.getByRole('button', { name: 'Restablecer zoom' })).toHaveTextContent('100%');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
  it('uploads and replaces the visible file through the authenticated storage API', async () => {
    vi.mocked(uploadProductAsset).mockResolvedValue(second);
    vi.mocked(listProductAssets).mockResolvedValue([second]);
    const onAssetsChange = vi.fn();
    render(
      <ProductGallery
        productId="product"
        name="Rodamiento"
        category="Rodamientos"
        assets={[photo]}
        attributes={[]}
        canManage
        onAssetsChange={onAssetsChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Opciones de fotografías' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reemplazar archivo visible' }));
    const file = new File(['jpg'], 'actualizada.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Archivo de fotografías'), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(uploadProductAsset).toHaveBeenCalledWith({
        productId: 'product',
        type: 'FOTO',
        position: 1,
        replacesAssetId: 'photo',
        file,
      }),
    );
    await waitFor(() => expect(onAssetsChange).toHaveBeenCalledWith([second]));
  });
  it('persists the complete order and keeps external/technical media immutable', async () => {
    const onAssetsChange = vi.fn();
    vi.mocked(reorderProductAssets).mockResolvedValue([second, photo]);
    render(
      <ProductGallery
        productId="product"
        name="Rodamiento"
        category="Rodamientos"
        assets={[photo, second]}
        attributes={[]}
        canManage
        onAssetsChange={onAssetsChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver Segunda.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opciones de fotografías' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Usar como principal' }));
    await waitFor(() =>
      expect(reorderProductAssets).toHaveBeenCalledWith('product', 'FOTO', ['second', 'photo']),
    );
    expect(onAssetsChange).toHaveBeenCalledWith([second, photo]);
  });
});
