'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';

/** Pixels from the actual downloadable bytes; no HTML approximation or PDF scripts. */
export function PdfDocumentPages({
  bytes,
  label = 'Ficha técnica',
}: {
  bytes: Uint8Array | null;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Preparando la vista previa…');
  useEffect(() => {
    if (!bytes) {
      host.current?.replaceChildren();
      setStatus('Preparando la vista previa…');
      return;
    }
    let cancelled = false,
      task: PDFDocumentLoadingTask | undefined;
    const renders: RenderTask[] = [];
    setStatus('Actualizando la vista previa…');
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({
          data: bytes.slice(),
          useWasm: false,
          isOffscreenCanvasSupported: false,
          maxImageSize: 12_000_000,
          canvasMaxAreaInBytes: 32_000_000,
        });
        const document = await task.promise,
          pages: HTMLElement[] = [],
          w = Math.max(240, Math.min(800, host.current?.clientWidth || 520));
        for (let index = 1; index <= document.numPages; index++) {
          if (cancelled) return;
          const page = await document.getPage(index),
            original = page.getViewport({ scale: 1 }),
            viewport = page.getViewport({
              scale: (w / original.width) * Math.min(2, window.devicePixelRatio || 1),
            }),
            canvas = window.document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${label} · Página ${index} de ${document.numPages}`);
          const render = page.render({
            canvas,
            viewport,
            annotationMode: pdfjs.AnnotationMode.DISABLE,
          });
          renders.push(render);
          await render.promise;
          const figure = window.document.createElement('figure'),
            caption = window.document.createElement('figcaption');
          figure.className = 'm-0 overflow-hidden bg-white shadow-sm';
          caption.textContent = `Página ${index} de ${document.numPages}`;
          caption.className = 'bg-slate-50 p-1 text-center text-[11px] text-slate-500';
          figure.append(canvas, caption);
          pages.push(figure);
        }
        if (!cancelled) {
          host.current?.replaceChildren(...pages);
          setStatus(
            `${document.numPages} ${document.numPages === 1 ? 'hoja' : 'hojas'} · ${Math.max(1, Math.round(bytes.length / 1024))} KB`,
          );
        }
      } catch (failure) {
        if (!cancelled)
          setStatus(
            `No se pudo preparar la vista previa: ${failure instanceof Error ? failure.message : 'inténtalo nuevamente'}`,
          );
      } finally {
        await task?.destroy().catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
      for (const render of renders) render.cancel();
      void task?.destroy().catch(() => undefined);
    };
  }, [bytes, label]);
  return (
    <div>
      <p className="mb-2 text-xs text-slate-600" aria-live="polite">
        {status}
      </p>
      <div ref={host} className="flex min-w-0 flex-col gap-3" />
    </div>
  );
}
