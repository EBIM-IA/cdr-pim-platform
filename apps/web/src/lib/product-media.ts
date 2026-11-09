import type { ProductAssetDto } from '@cdr/contracts';

import { productAssetDownloadUrl } from '@/lib/product-assets-api';

export interface ProductGallerySlide {
  readonly id: string;
  readonly label: string;
  readonly src?: string;
  readonly document?: boolean;
  readonly asset?: ProductAssetDto;
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
  type: 'FOTO' | 'PLANO' = 'FOTO',
): ProductGallerySlide[] {
  const uploaded = assets
    .filter((asset) => asset.type === type)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  const pattern = type === 'FOTO' ? /fotograf|photo|foto/iu : /plano|drawing/iu;
  const registered = attributes
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
                    label: type === 'FOTO' ? 'Fotografía del fabricante' : 'Plano del fabricante',
                  },
                ]
              : [];
          })
        : [],
    );
  const slides: ProductGallerySlide[] = [
    ...uploaded.map((asset) => ({
      id: asset.id,
      label: asset.filename,
      src: productAssetDownloadUrl(asset.id),
      asset,
      document: !/^image\/(?:jpeg|png|webp)$/iu.test(asset.mimeType),
    })),
    ...registered,
  ];
  const unique = [...new Map(slides.map((slide) => [slide.src, slide])).values()];
  return type === 'PLANO' || !unique.length
    ? [...unique, { id: 'technical-drawing', label: 'Esquema técnico referencial' }]
    : unique;
}
