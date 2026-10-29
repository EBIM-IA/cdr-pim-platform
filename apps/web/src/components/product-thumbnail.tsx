'use client';

import type { ProductAssetDto } from '@cdr/contracts';
import { useState } from 'react';

import { ProductArtwork } from '@/components/product-artwork';
import { productGallerySlides } from '@/lib/product-media';
import type { Product } from '@/lib/types';

function Photo({ src, product }: { src: string; product: Product }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <ProductArtwork
        category={product.category}
        name={product.name}
        className="!aspect-square h-auto min-h-14 rounded-lg"
      />
    );
  // The browser carries the private asset cookie; a failed image falls back to its family drawing.
  return (
    <img
      src={src}
      alt={`Fotografía de ${product.sku}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="aspect-square min-h-14 w-full rounded-lg border bg-white object-contain p-1"
      onError={() => setFailed(true)}
    />
  );
}
export function ProductThumbnail({
  product,
  assets = [],
}: {
  product: Product;
  assets?: readonly ProductAssetDto[];
}) {
  const photos = productGallerySlides(
    assets.filter((asset) => asset.type === 'FOTO'),
    product.attributes.filter((attribute) =>
      /foto|photo/iu.test(`${attribute.key} ${attribute.label}`),
    ),
  );
  const src = photos.find((slide) => slide.src)?.src;
  return src ? (
    <Photo key={src} src={src} product={product} />
  ) : (
    <ProductArtwork
      category={product.category}
      name={product.name}
      className="!aspect-square h-auto min-h-14 rounded-lg"
    />
  );
}
