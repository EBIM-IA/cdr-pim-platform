'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ProductAssetDto } from '@cdr/contracts';

import { ProductArtwork } from '@/components/product-artwork';
import { productGallerySlides } from '@/lib/product-media';

export function ProductGallery({
  name,
  category,
  assets,
  attributes,
  error,
}: {
  name: string;
  category: string;
  assets: readonly ProductAssetDto[];
  attributes: readonly { key: string; label: string; value: unknown }[];
  error?: string | null;
}) {
  const slides = useMemo(() => productGallerySlides(assets, attributes), [assets, attributes]);
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(0);
    setFailed(new Set());
  }, [name]);
  const visible = slides.filter((slide) => !failed.has(slide.id));
  const index = Math.min(selected, visible.length - 1);
  const current = visible[index]!;
  const step = (delta: number) => setSelected((index + delta + visible.length) % visible.length);
  return (
    <div
      aria-label="Galería del producto"
      role="region"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          step(event.key === 'ArrowRight' ? 1 : -1);
        }
      }}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-white">
        {current.src ? (
          // Private asset URLs require the authenticated same-origin browser request.
          <img
            src={current.src}
            alt={`${name} · ${current.label}`}
            className="h-full w-full object-contain p-2"
            referrerPolicy="no-referrer"
            onError={() => {
              setFailed((previous) => new Set([...previous, current.id]));
              setSelected(0);
            }}
          />
        ) : (
          <ProductArtwork
            category={category}
            name={name}
            technical
            className="!aspect-square h-full w-full border-0"
          />
        )}
        {visible.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Imagen anterior"
              onClick={() => step(-1)}
              className="absolute left-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full border bg-white/90 shadow"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Imagen siguiente"
              onClick={() => step(1)}
              className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full border bg-white/90 shadow"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        ) : null}
      </div>
      {visible.length > 1 ? (
        <div className="mt-2 flex gap-1.5 overflow-x-auto" aria-label="Miniaturas">
          {visible.map((slide, i) => (
            <button
              type="button"
              key={slide.id}
              aria-label={`Ver ${slide.label}`}
              aria-pressed={index === i}
              onClick={() => setSelected(i)}
              className={`size-11 shrink-0 overflow-hidden rounded border p-1 ${index === i ? 'border-primary ring-1 ring-primary' : 'border-slate-200'}`}
            >
              {slide.src ? (
                <img
                  src={slide.src}
                  alt=""
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span aria-hidden="true" className="block h-full w-full">
                  <ProductArtwork
                    name={name}
                    category={category}
                    technical
                    className="!aspect-square h-full w-full rounded-none border-0"
                  />
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
      <p aria-live="polite" className="mt-2 text-[10px] text-muted-foreground">
        {current.label}
        {visible.length > 1 ? ` · ${index + 1}/${visible.length}` : ' · sin fotografía'}
      </p>
      {error ? (
        <p role="status" className="mt-1 text-[10px] text-amber-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
