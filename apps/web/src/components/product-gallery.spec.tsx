import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProductAssetDto } from '@cdr/contracts';

import { ProductGallery } from './product-gallery';

const assets = [
  {
    id: 'photo',
    type: 'FOTO',
    filename: 'Foto del cliente.jpg',
    mimeType: 'image/jpeg',
    position: 1,
  },
  { id: 'plan', type: 'PLANO', filename: 'Plano.png', mimeType: 'image/png', position: 1 },
] as ProductAssetDto[];

describe('ProductGallery', () => {
  it('supports thumbnails, arrows, keyboard and fallback after a broken image', () => {
    render(
      <ProductGallery
        name="Rodamiento 6205"
        category="Rodamientos"
        assets={assets}
        attributes={[]}
      />,
    );
    expect(screen.getByRole('img', { name: /Rodamiento 6205 · Foto/u })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente' }));
    expect(screen.getByRole('img', { name: /Rodamiento 6205 · Plano/u })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Galería del producto' }), {
      key: 'ArrowRight',
    });
    expect(screen.getByRole('img', { name: /Ilustración referencial/u })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver Foto del cliente.jpg' }));
    fireEvent.error(screen.getByRole('img', { name: /Rodamiento 6205 · Foto/u }));
    expect(
      screen.queryByRole('button', { name: 'Ver Foto del cliente.jpg' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Rodamiento 6205 · Plano/u })).toBeVisible();
  });
});
