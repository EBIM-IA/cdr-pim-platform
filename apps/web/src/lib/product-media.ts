import type { ProductAssetDto } from '@cdr/contracts';

import { productAssetDownloadUrl } from '@/lib/product-assets-api';

export interface ProductGallerySlide {
  readonly id: string;
  readonly label: string;
  readonly src?: string;
}
/** Raster URLs only: never execute schemes or load arbitrary active SVG/HTML as gallery media. */
export function productImageUrl(value: string): string | undefined {
  const raw = value.trim();
  if (
    !raw ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32) ||
    raw.startsWith('//')
  )
    return undefined;
  try {
    const url = new URL(raw, 'https://pim.invalid');
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !/\.(?:jpe?g|png|webp)(?:$)/iu.test(url.pathname)
    )
      return undefined;
    return raw.startsWith('/') ? raw : url.origin === 'https://pim.invalid' ? undefined : url.href;
  } catch {
    return undefined;
  }
}
export function productGallerySlides(
  assets: readonly ProductAssetDto[],
  attributes: readonly { key: string; label: string; value: unknown }[],
): ProductGallerySlide[] {
  const raster = assets.filter((asset) => /^(?:image\/(?:jpeg|png|webp))$/iu.test(asset.mimeType));
  const photos = raster
    .filter((asset) => asset.type === 'FOTO')
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  const plans = raster.filter((asset) => asset.type === 'PLANO');
  const registered = (pattern: RegExp) =>
    attributes
      .filter((attribute) => pattern.test(`${attribute.key} ${attribute.label}`))
      .flatMap((attribute) =>
        typeof attribute.value === 'string'
          ? attribute.value.split('|').flatMap((raw) => {
              const src = productImageUrl(raw);
              return src
                ? [
                    {
                      id: src,
                      src,
                      label: /plano/iu.test(attribute.label)
                        ? 'Plano del producto'
                        : 'Fotografía del producto',
                    },
                  ]
                : [];
            })
          : [],
      );
  const fromAsset = (asset: ProductAssetDto): ProductGallerySlide => ({
    id: asset.id,
    label: asset.filename,
    src: productAssetDownloadUrl(asset.id),
  });
  const slides = [
    ...photos.map(fromAsset),
    ...registered(/fotograf|photo|foto/iu),
    ...plans.map(fromAsset),
    ...registered(/plano|drawing/iu),
  ];
  return [
    ...new Map(slides.map((slide) => [slide.src, slide])).values(),
    { id: 'technical-drawing', label: 'Esquema técnico referencial' },
  ];
}
