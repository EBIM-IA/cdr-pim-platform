import { describe, expect, it } from 'vitest';
import type { ProductAssetDto } from '@cdr/contracts';

import { productGallerySlides, productImageUrl } from './product-media';

const asset = (id: string, type: 'FOTO' | 'PLANO', mimeType = 'image/jpeg', position = 1) =>
  ({ id, type, mimeType, position, filename: `${id}.jpg` }) as ProductAssetDto;

describe('product gallery media', () => {
  it('orders photographs by position, registered photographs, plans, then the technical drawing', () => {
    const slides = productGallerySlides(
      [
        asset('plan', 'PLANO'),
        asset('second', 'FOTO', 'image/jpeg', 2),
        asset('first', 'FOTO'),
        asset('pdf', 'PLANO', 'application/pdf'),
      ],
      [
        {
          key: 'fotos',
          label: 'Fotografías del producto',
          value:
            'https://manufacturer.example/a.jpg|https://manufacturer.example/b.png|https://manufacturer.example/a.jpg',
        },
      ],
    );
    expect(slides.map((slide) => slide.id)).toEqual([
      'first',
      'second',
      'https://manufacturer.example/a.jpg',
      'https://manufacturer.example/b.png',
      'plan',
      'technical-drawing',
    ]);
    expect(slides.at(-1)?.src).toBeUndefined();
  });
  it.each([
    'javascript:alert(1)',
    'data:image/svg+xml,content',
    '//remote.example/x.jpg',
    '/x.svg',
    'https://remote.example/index.html',
    '/x.jpg\n',
  ])('rejects unsafe or non-raster media %s', (url) => {
    expect(productImageUrl(url)).toBeUndefined();
  });
  it('accepts absolute raster paths and https URLs with signed queries', () => {
    expect(productImageUrl('/reference/product.jpg')).toBe('/reference/product.jpg');
    expect(productImageUrl('https://manufacturer.example/product.webp?signature=abc')).toContain(
      'signature=abc',
    );
  });
});
