'use client';

import type { ProductAttributeSheetDto, ProductAssetDto } from '@cdr/contracts';
import { Download, Printer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PdfDocumentPages } from '@/components/pdf-document-pages';
import { fetchProductTechnicalSheet } from '@/lib/dynamic-catalog-api';
import {
  technicalSheetDocument,
  technicalSheetDesign,
  technicalSheetMedia,
  technicalSheetLogo,
  technicalSheetCopy,
  technicalSheetBrand,
  type TechnicalSheetVariantSelection,
} from '@/lib/technical-sheet-export';
import { fetchPdfDesignSettings } from '@/lib/pdf-design-api';
import { createTechnicalSheetPdf } from '@/lib/technical-sheet-pdf';
import { downloadBinary, technicalSheetFilename } from '@/lib/zip-export';
import type { Product } from '@/lib/types';
import type { MeasurementSystem } from '@/lib/units';

interface TechnicalSheetPreviewProps {
  readonly open: boolean;
  readonly product: Product;
  readonly sheet: ProductAttributeSheetDto;
  readonly unitSystem: MeasurementSystem;
  readonly onClose: () => void;
  readonly assets?: readonly ProductAssetDto[];
  readonly variantSelection?: TechnicalSheetVariantSelection;
}
export function TechnicalSheetPreview({
  open,
  product,
  sheet,
  unitSystem,
  onClose,
  assets = [],
  variantSelection,
}: TechnicalSheetPreviewProps) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null),
    [error, setError] = useState(''),
    [designName, setDesignName] = useState('');
  const dialog = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  const assetKey = assets.map((asset) => `${asset.id}:${asset.position ?? ''}`).join(',');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBytes(null);
    setError('');
    void (async () => {
      const [current, settings, logo, media, brand] = await Promise.all([
        fetchProductTechnicalSheet(product.id, controller.signal),
        fetchPdfDesignSettings(controller.signal),
        technicalSheetLogo(controller.signal),
        technicalSheetMedia(assets, controller.signal),
        technicalSheetBrand(product.brand, controller.signal),
      ]);
      const options = technicalSheetDesign(current, settings.config);
      const copy = await technicalSheetCopy(current, controller.signal, variantSelection);
      const output = await createTechnicalSheetPdf({
        ...technicalSheetDocument(current, unitSystem),
        cdrLogo: logo,
        media,
        ...brand,
        ...options,
        ...copy,
      });
      if (!controller.signal.aborted) {
        setBytes(output);
        setDesignName(options.design.name);
      }
    })().catch((failure: unknown) => {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'No se pudo generar la ficha PDF.');
    });
    return () => controller.abort();
    // Reload when the actual asset identity changes, without recreating PDF for array allocation.
  }, [
    open,
    product.id,
    product.brand,
    sheet,
    unitSystem,
    assetKey,
    variantSelection?.type,
    variantSelection?.applicationId,
  ]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab' || !dialog.current) return;
      const elements = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,[tabindex="0"]',
          ),
        ],
        first = elements[0],
        last = elements.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  const print = () => {
    if (!bytes) return;
    const buffer = new ArrayBuffer(bytes.length);
    new Uint8Array(buffer).set(bytes);
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' })),
      frame = document.createElement('iframe');
    frame.title = 'Impresión de ficha técnica';
    frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, '_blank', 'noopener');
      }
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    document.body.append(frame);
  };
  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-3 sm:p-7"
      role="presentation"
    >
      <button
        type="button"
        className="fixed inset-0 cursor-default"
        aria-label="Cerrar vista previa"
        onClick={onClose}
      />
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="technical-sheet-title"
        className="relative mx-auto max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl outline-none"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="technical-sheet-title" className="text-xl font-bold">
              Ficha técnica · {product.sku}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {designName
                ? `Diseño ${designName} · vista previa del PDF que se descarga`
                : 'Preparando documento…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={!bytes} onClick={print}>
              <Printer className="size-4" aria-hidden="true" />
              Imprimir
            </Button>
            <Button
              type="button"
              disabled={!bytes}
              onClick={() =>
                bytes &&
                downloadBinary(bytes, technicalSheetFilename(product.sku), 'application/pdf')
              }
            >
              <Download className="size-4" aria-hidden="true" />
              Descargar PDF
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="size-5" />
            </Button>
          </div>
        </header>
        {error ? (
          <p role="alert" className="border-b bg-red-50 px-5 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <div className="max-h-[calc(100vh-12rem)] overflow-auto bg-[#eef0f2] p-3 sm:p-6">
          <div className="mx-auto max-w-[794px]">
            <PdfDocumentPages bytes={bytes} label={`Ficha técnica ${product.sku}`} />
          </div>
        </div>
      </section>
    </div>
  );
}
