'use client';

import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';

// Limit private PDF downloads/decoders across the visible grid, without caching files in storage.
let active = 0;
const waiting: Array<() => void> = [];
function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}
function acquireSlot(): Promise<() => void> {
  if (active < 2) {
    active++;
    return Promise.resolve(releaseSlot);
  }
  return new Promise((resolve) => waiting.push(() => resolve(releaseSlot)));
}

/** Render only first-page pixels; PDF actions, scripts, annotations and embeds are never mounted. */
export function PdfCatalogCover({ url, title }: { url: string; title: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'waiting' | 'ready' | 'error'>('waiting');
  useEffect(() => {
    let cancelled = false;
    let started = false;
    let task: PDFDocumentLoadingTask | undefined;
    let render: RenderTask | undefined;
    setState('waiting');
    const load = async () => {
      if (started) return;
      started = true;
      const release = await acquireSlot();
      try {
        if (cancelled) return;
        const pdfjs = await import('pdfjs-dist');
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({
          url,
          withCredentials: true,
          maxImageSize: 12_000_000,
          canvasMaxAreaInBytes: 32_000_000,
          useWasm: false,
          isOffscreenCanvasSupported: false,
        });
        const document = await task.promise;
        const page = await document.getPage(1);
        if (cancelled || !canvas.current) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 600 / original.width) });
        canvas.current.width = Math.ceil(viewport.width);
        canvas.current.height = Math.ceil(viewport.height);
        render = page.render({
          canvas: canvas.current,
          viewport,
          annotationMode: pdfjs.AnnotationMode.DISABLE,
        });
        await render.promise;
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      } finally {
        await task?.destroy().catch(() => undefined);
        release();
      }
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void load();
              }
            },
            { rootMargin: '200px' },
          );
    if (observer && container.current) observer.observe(container.current);
    else void load();
    return () => {
      cancelled = true;
      observer?.disconnect();
      render?.cancel();
      void task?.destroy().catch(() => undefined);
    };
  }, [url]);
  return (
    <div ref={container} className="relative flex h-full w-full items-center justify-center">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Portada de ${title}`}
        className={`max-h-full max-w-full object-contain ${state === 'ready' ? '' : 'invisible'}`}
      />
      {state !== 'ready' ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center text-slate-500">
          <FileText aria-hidden="true" className="size-12" />
          <span className="text-xs">
            {state === 'error' ? 'Vista previa no disponible · abrir PDF' : 'Cargando portada…'}
          </span>
        </span>
      ) : null}
    </div>
  );
}
