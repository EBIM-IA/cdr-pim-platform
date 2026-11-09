'use client';

import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProductAssetDto } from '@cdr/contracts';
import { PRODUCT_ASSET_MAX_BYTES } from '@cdr/contracts';

import { ProductArtwork } from '@/components/product-artwork';
import { Button } from '@/components/ui/button';
import {
  deleteProductAsset,
  listProductAssets,
  reorderProductAssets,
  uploadProductAsset,
} from '@/lib/product-assets-api';
import { productGallerySlides } from '@/lib/product-media';

export function ProductGallery({
  name,
  category,
  assets,
  attributes,
  error,
  type = 'FOTO',
  productId,
  canManage = false,
  onAssetsChange,
}: {
  name: string;
  category: string;
  assets: readonly ProductAssetDto[];
  attributes: readonly { key: string; label: string; value: unknown }[];
  error?: string | null;
  type?: 'FOTO' | 'PLANO';
  productId?: string;
  canManage?: boolean;
  onAssetsChange?: (assets: ProductAssetDto[]) => void;
}) {
  const slides = useMemo(
    () => productGallerySlides(assets, attributes, type),
    [assets, attributes, type],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const menuElement = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replacement = useRef<ProductAssetDto | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const label = type === 'FOTO' ? 'fotografías' : 'planos';
  const visible = slides.filter((slide) => !failed.has(slide.id));
  const index = Math.max(
    0,
    visible.findIndex((slide) => slide.id === selectedId),
  );
  const current = visible[index] ?? {
    id: 'technical-drawing',
    label: 'Esquema técnico referencial',
  };
  const uploaded = slides.flatMap((slide) => (slide.asset ? [slide.asset] : []));
  const ownIndex = uploaded.findIndex((asset) => asset.id === current.id);
  const manage = canManage && !!productId && !!onAssetsChange;
  const step = (delta: number) => {
    setSelectedId(visible[(index + delta + visible.length) % visible.length]?.id ?? null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setMenu(false);
  };
  useEffect(() => {
    setSelectedId(null);
    setFailed(new Set());
    setMenu(false);
    setNotice(null);
  }, [productId, name, type]);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [selectedId]);
  useEffect(() => {
    if (!zoomOpen) return;
    pointers.current.clear();
    pinch.current = 0;
    drag.current = null;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [zoomOpen]);
  useEffect(() => {
    if (!menu) return;
    menuElement.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-gallery-menu]'))
        setMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);
  const run = async (operation: () => Promise<void>) => {
    if (!manage || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    setMenu(false);
    try {
      await operation();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No se pudo actualizar la galería.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const choose = (asset: ProductAssetDto | null) => {
    replacement.current = asset;
    setMenu(false);
    fileInput.current?.click();
  };
  const upload = (file: File) =>
    void run(async () => {
      if (!file.size || file.size > PRODUCT_ASSET_MAX_BYTES)
        throw new Error('El archivo debe tener contenido y pesar como máximo 20 MB.');
      const replaced = replacement.current;
      const result = await uploadProductAsset({
        productId: productId!,
        type,
        file,
        ...(replaced?.position
          ? { position: replaced.position, replacesAssetId: replaced.id }
          : {}),
      });
      const refreshed = await listProductAssets({ productId: productId! });
      onAssetsChange!(refreshed);
      setSelectedId(result.id);
      setFailed(new Set());
      setNotice(`${result.filename} ${replaced ? 'reemplazado' : 'agregado'} correctamente.`);
    });
  const reorder = (id: string, targetIndex: number) =>
    void run(async () => {
      const ids = uploaded.map((asset) => asset.id);
      const from = ids.indexOf(id);
      if (from < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
      ids.splice(from, 1);
      ids.splice(targetIndex, 0, id);
      onAssetsChange!(await reorderProductAssets(productId!, type, ids));
      setSelectedId(id);
      setNotice('Orden guardado. El primer archivo es el principal.');
    });
  const drawing = (
    <ProductArtwork
      category={category}
      name={name}
      technical
      className="!aspect-square h-full w-full border-0"
    />
  );
  const media = current.document ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center text-sm">
      <FileText aria-hidden="true" className="size-10 text-slate-400" />
      <strong className="break-all">{current.label}</strong>
      <p className="text-xs text-muted-foreground">Plano · sin vista previa de imagen</p>
      <a
        className="text-primary underline"
        href={current.src}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir o descargar plano
      </a>
    </div>
  ) : current.src ? (
    <img
      src={current.src}
      alt={`${name} · ${current.label}`}
      className="h-full w-full object-contain p-2"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed((previous) => new Set([...previous, current.id]));
        setSelectedId(null);
      }}
    />
  ) : (
    drawing
  );
  const thumbnails = (large = false) => (
    <div
      className="mt-2 flex gap-1.5 overflow-x-auto"
      aria-label={large ? 'Miniaturas del visor' : `Miniaturas de ${label}`}
    >
      {visible.map((slide, i) => (
        <button
          type="button"
          key={slide.id}
          aria-label={`Ver ${slide.label}`}
          aria-pressed={index === i}
          disabled={busy}
          draggable={!large && manage && !!slide.asset && !busy}
          onDragStart={() => setDragged(slide.id)}
          onDragEnd={() => setDragged(null)}
          onDragOver={(event) => {
            if (dragged && slide.asset) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragged && slide.asset)
              reorder(
                dragged,
                uploaded.findIndex((asset) => asset.id === slide.id),
              );
            setDragged(null);
          }}
          onClick={() => {
            setSelectedId(slide.id);
            setMenu(false);
          }}
          className={`relative size-11 shrink-0 overflow-hidden rounded border bg-white p-1 ${index === i ? 'border-primary ring-1 ring-primary' : 'border-slate-200'}`}
        >
          {slide.document ? (
            <FileText aria-hidden="true" className="m-auto size-5" />
          ) : slide.src ? (
            <img
              src={slide.src}
              alt=""
              className="h-full w-full object-contain"
              referrerPolicy="no-referrer"
              onError={() => setFailed((previous) => new Set([...previous, slide.id]))}
            />
          ) : (
            <span aria-hidden="true">{drawing}</span>
          )}
        </button>
      ))}
    </div>
  );
  return (
    <div
      aria-label={type === 'FOTO' ? 'Galería del producto' : 'Galería de planos'}
      role="region"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          step(event.key === 'ArrowRight' ? 1 : -1);
        }
      }}
    >
      <div className="relative aspect-square rounded-lg border bg-white">
        <div
          className="h-full overflow-hidden rounded-lg"
          role={!current.document ? 'button' : undefined}
          tabIndex={!current.document ? 0 : undefined}
          aria-label={!current.document ? `Abrir visor de ${current.label}` : undefined}
          onClick={() => {
            if (!current.document) {
              setHover(null);
              setZoomOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (!current.document && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              setHover(null);
              setZoomOpen(true);
            }
          }}
          onPointerMove={(event) => {
            if (event.pointerType === 'mouse' && !current.document) {
              const rect = event.currentTarget.getBoundingClientRect();
              setHover(
                `${((event.clientX - rect.left) / rect.width) * 100}% ${((event.clientY - rect.top) / rect.height) * 100}%`,
              );
            }
          }}
          onPointerLeave={() => setHover(null)}
        >
          <div
            className="h-full w-full transition-transform motion-reduce:transition-none"
            style={hover ? { transform: 'scale(2)', transformOrigin: hover } : undefined}
          >
            {media}
          </div>
        </div>
        {!current.document ? (
          <button
            ref={trigger}
            type="button"
            aria-label={`Ampliar ${type === 'FOTO' ? 'imagen' : 'plano'}`}
            className="absolute right-2 top-2 rounded-full border bg-white/90 p-2 shadow"
            onClick={() => {
              setHover(null);
              setZoomOpen(true);
            }}
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
        ) : null}
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
        {current.asset && ownIndex === 0 && uploaded.length > 1 ? (
          <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold">
            Principal
          </span>
        ) : null}
      </div>
      {visible.length > 1 ? thumbnails() : null}
      <div className="mt-2 flex items-start justify-between gap-2">
        <p
          aria-live="polite"
          className="min-w-0 break-words text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]"
        >
          {current.label}
          {visible.length > 1
            ? ` · ${index + 1}/${visible.length}`
            : current.src
              ? ''
              : ' · sin fotografía'}
          {type === 'PLANO'
            ? ' · El esquema referencial no sustituye al plano del fabricante.'
            : ''}
        </p>
        {manage ? (
          <div className="relative shrink-0" data-gallery-menu>
            <Button
              variant="outline"
              size="sm"
              ref={menuTrigger}
              aria-label={`Opciones de ${label}`}
              aria-expanded={menu}
              aria-haspopup="menu"
              disabled={busy}
              onClick={() => setMenu((value) => !value)}
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
              <span>{busy ? 'Guardando…' : 'Cargar / actualizar'}</span>
            </Button>
            {menu ? (
              <div
                ref={menuElement}
                role="menu"
                aria-label={`Administrar ${label}`}
                className="absolute right-0 z-[60] mt-1 w-56 rounded-lg border bg-white p-1 text-xs shadow-xl"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setMenu(false);
                    event.stopPropagation();
                    menuTrigger.current?.focus();
                  }
                  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const buttons = [
                      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        'button:not([disabled])',
                      ),
                    ];
                    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? buttons.length - 1
                          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                            buttons.length;
                    buttons[next]?.focus();
                  }
                }}
              >
                <button
                  role="menuitem"
                  type="button"
                  className="block w-full rounded p-2 text-left hover:bg-orange-50"
                  onClick={() => choose(null)}
                >
                  Agregar {type === 'FOTO' ? 'imagen' : 'plano'}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="block w-full rounded p-2 text-left hover:bg-orange-50 disabled:opacity-40"
                  disabled={!current.asset}
                  onClick={() => choose(current.asset ?? null)}
                >
                  Reemplazar archivo visible
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="block w-full rounded p-2 text-left text-red-700 hover:bg-red-50 disabled:opacity-40"
                  disabled={!current.asset}
                  onClick={() => {
                    if (current.asset && window.confirm(`¿Eliminar ${current.label}?`))
                      void run(async () => {
                        await deleteProductAsset(current.asset!.id);
                        onAssetsChange!(await listProductAssets({ productId: productId! }));
                        setSelectedId(null);
                        setNotice('Archivo eliminado.');
                      });
                  }}
                >
                  Eliminar archivo visible
                </button>
                <div role="separator" className="my-1 border-t" />
                {(
                  [
                    ['Usar como principal', 0],
                    ['Mover a la izquierda', ownIndex - 1],
                    ['Mover a la derecha', ownIndex + 1],
                  ] as const
                ).map(([text, target]) => (
                  <button
                    key={text}
                    role="menuitem"
                    type="button"
                    className="block w-full rounded p-2 text-left hover:bg-orange-50 disabled:opacity-40"
                    disabled={
                      !current.asset ||
                      target < 0 ||
                      target >= uploaded.length ||
                      target === ownIndex
                    }
                    onClick={() => reorder(current.id, target)}
                  >
                    {text}
                  </button>
                ))}
                {!current.asset ? (
                  <p className="p-2 text-[10px] text-muted-foreground">
                    Los archivos del fabricante y el esquema técnico son de consulta.
                  </p>
                ) : null}
              </div>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label={`Archivo de ${label}`}
              accept={type === 'FOTO' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.png,.jpg,.jpeg,.dwg'}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) upload(file);
              }}
            />
          </div>
        ) : null}
      </div>
      {error || notice ? (
        <p role="status" className="mt-1 text-[10px] text-amber-800">
          {notice ?? error}
        </p>
      ) : null}
      {zoomOpen ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 p-3 text-white sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Visor de ${label}`}
          ref={modal}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setZoomOpen(false);
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              step(event.key === 'ArrowRight' ? 1 : -1);
            }
            if (['+', '=', '-'].includes(event.key)) {
              event.preventDefault();
              setZoom((value) =>
                Math.min(6, Math.max(1, value + (event.key === '-' ? -0.5 : 0.5))),
              );
            }
            if (event.key === 'Tab') {
              const buttons = [
                ...(modal.current?.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), a[href]',
                ) ?? []),
              ];
              const first = buttons[0],
                last = buttons.at(-1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="min-w-0 break-all text-sm">{current.label}</strong>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Reducir zoom"
                onClick={() => {
                  setZoom((value) => Math.max(1, value - 0.5));
                  setPan({ x: 0, y: 0 });
                }}
                className="rounded border p-2"
              >
                <ZoomOut className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Restablecer zoom"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="Aumentar zoom"
                onClick={() => setZoom((value) => Math.min(6, value + 0.5))}
                className="rounded border p-2"
              >
                <ZoomIn className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Cerrar visor"
                onClick={() => setZoomOpen(false)}
                className="rounded border p-2"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div
            className="my-3 min-h-0 flex-1 overflow-hidden rounded-lg bg-white text-slate-800 touch-none"
            onDoubleClick={() => {
              setZoom(zoom > 1 ? 1 : 2.5);
              setPan({ x: 0, y: 0 });
            }}
            onWheel={(event) =>
              setZoom((value) => Math.min(6, Math.max(1, value * (event.deltaY < 0 ? 1.15 : 0.85))))
            }
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()];
                pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
                drag.current = null;
                return;
              }
              if (zoom <= 1) return;
              drag.current = { x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y };
            }}
            onPointerMove={(event) => {
              if (!pointers.current.has(event.pointerId)) return;
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()];
                const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
                if (pinch.current > 0) {
                  const ratio = distance / pinch.current;
                  setZoom((value) => Math.min(6, Math.max(1, value * ratio)));
                }
                pinch.current = distance;
                return;
              }
              const start = drag.current;
              if (!start) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const boundX = (rect.width * (zoom - 1)) / 2,
                boundY = (rect.height * (zoom - 1)) / 2;
              setPan({
                x: Math.max(-boundX, Math.min(boundX, start.startX + event.clientX - start.x)),
                y: Math.max(-boundY, Math.min(boundY, start.startY + event.clientY - start.y)),
              });
            }}
            onPointerUp={(event) => {
              pointers.current.delete(event.pointerId);
              pinch.current = 0;
              drag.current = null;
            }}
            onPointerCancel={(event) => {
              pointers.current.delete(event.pointerId);
              pinch.current = 0;
              drag.current = null;
            }}
          >
            <div
              className="h-full w-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                cursor: zoom > 1 ? 'grab' : 'zoom-in',
              }}
            >
              {media}
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button type="button" aria-label="Anterior en visor" onClick={() => step(-1)}>
              <ChevronLeft />
            </button>
            <span className="text-xs">
              {index + 1}/{visible.length}
            </span>
            <button type="button" aria-label="Siguiente en visor" onClick={() => step(1)}>
              <ChevronRight />
            </button>
          </div>
          {thumbnails(true)}
        </div>
      ) : null}
    </div>
  );
}
