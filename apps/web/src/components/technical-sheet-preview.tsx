'use client';

import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { Download, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ProductArtwork } from '@/components/product-artwork';
import { Button } from '@/components/ui/button';
import { technicalAttributesFromSheet, unifiedCodeFromSheet } from '@/lib/product-detail-data';
import type { Product } from '@/lib/types';
import { displayMeasurement, type MeasurementSystem } from '@/lib/units';

interface TechnicalSheetPreviewProps {
  readonly open: boolean;
  readonly product: Product;
  readonly sheet: ProductAttributeSheetDto;
  readonly unitSystem: MeasurementSystem;
  readonly onClose: () => void;
}

function printableValue(
  value: string | number | boolean,
  unit: string | null,
  key: string,
  unitSystem: MeasurementSystem,
): string {
  const measurement = displayMeasurement(
    value,
    { unit: unit ?? undefined, attributeKey: key },
    unitSystem,
  );
  if (measurement) return measurement.primary.text;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return `${String(value)}${unit ? ` ${unit}` : ''}`;
}

function printPreview(): void {
  const source = document.getElementById('technical-sheet-document');
  if (!source) return;

  const popup = window.open('', '_blank', 'width=980,height=760');
  if (!popup) {
    throw new Error('El navegador bloqueó la ventana de impresión. Habilita ventanas emergentes.');
  }
  popup.opener = null;

  popup.document.title = source.getAttribute('data-file-name') ?? 'Ficha técnica CDR';
  const style = popup.document.createElement('style');
  style.textContent = `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1d1d1f; font-family: Arial, Helvetica, sans-serif; }
    .sheet { min-height: 270mm; border-top: 6px solid #ea5b0c; padding: 18px 22px 24px; }
    .sheet-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid #dfe3e8; padding-bottom: 14px; }
    .sheet-logo { width: 180px; height: auto; }
    .sheet-kicker { color: #ea5b0c; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 6px 0 0; font-size: 25px; line-height: 1.15; }
    .sheet-code { margin: 7px 0 0; color: #596273; font-family: monospace; font-size: 12px; }
    .sheet-summary { display: grid; grid-template-columns: 190px 1fr; gap: 22px; margin-top: 20px; }
    .sheet-art { display: grid; place-items: center; min-height: 145px; color: #596273; background: #f4f5f6; border-radius: 10px; overflow: hidden; }
    .sheet-art figure { width: 100%; margin: 0; background: transparent; }
    .sheet-art svg { display: block; width: 86%; max-height: 145px; margin: auto; }
    .sheet-description { color: #596273; font-size: 11px; line-height: 1.6; }
    .sheet-base { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin: 16px 0 0; }
    .sheet-base div, .sheet-attribute { break-inside: avoid; }
    dt { color: #737b88; font-size: 9px; }
    dd { margin: 3px 0 0; font-size: 11px; font-weight: 700; }
    .sheet-section-title { margin: 24px 0 9px; color: #ea5b0c; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    .sheet-attributes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid #dfe3e8; border-radius: 8px; overflow: hidden; }
    .sheet-attribute { min-height: 47px; padding: 9px 11px; border-bottom: 1px solid #e8ebef; }
    .sheet-attribute:nth-child(odd) { border-right: 1px solid #e8ebef; }
    .sheet-footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #dfe3e8; color: #737b88; font-size: 8px; line-height: 1.45; }
    .no-print { display: none !important; }
  `;
  popup.document.head.append(style);
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  popup.document.body.append(clone);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    popup.print();
    popup.close();
  }, 250);
}

export function TechnicalSheetPreview({
  open,
  product,
  sheet,
  unitSystem,
  onClose,
}: TechnicalSheetPreviewProps) {
  const [printError, setPrintError] = useState<string | null>(null);
  const closePreview = useCallback(() => {
    setPrintError(null);
    onClose();
  }, [onClose]);
  const attributes = useMemo(
    () =>
      technicalAttributesFromSheet(sheet)
        .filter(
          (attribute) =>
            attribute.includeInTechnicalSheet &&
            attribute.canExport &&
            attribute.value !== null &&
            String(attribute.value).trim() !== '',
        )
        .map((attribute) => ({
          ...attribute,
          printable: printableValue(
            attribute.value as string | number | boolean,
            attribute.unit,
            attribute.key,
            unitSystem,
          ),
        })),
    [sheet, unitSystem],
  );
  const configuredColumns = sheet.schema.columns.filter(
    (column) => column.includeInTechnicalSheet && column.permissions.export,
  ).length;
  const omitted = sheet.schema.columns.length - attributes.length;
  const unifiedCode = unifiedCodeFromSheet(sheet) ?? product.unifiedCode;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [closePreview, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-4 sm:p-8"
      role="presentation"
    >
      <button
        type="button"
        className="fixed inset-0 cursor-default"
        aria-label="Cerrar vista previa"
        onClick={closePreview}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="technical-sheet-title"
        className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="no-print flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-primary">
              Vista previa descargable
            </p>
            <h2 id="technical-sheet-title" className="mt-1 text-xl font-bold">
              Ficha técnica · {product.sku}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {attributes.length} atributos con valor de {configuredColumns} configurados para la
              ficha; {omitted} omitidos por configuración o falta de dato.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                setPrintError(null);
                try {
                  printPreview();
                } catch (error) {
                  setPrintError(
                    error instanceof Error
                      ? error.message
                      : 'No fue posible abrir la impresión de la ficha técnica.',
                  );
                }
              }}
            >
              <Download aria-hidden="true" className="size-4" /> Descargar PDF
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closePreview}
              aria-label="Cerrar"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </div>
        </header>

        {printError ? (
          <p
            className="no-print border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800"
            role="alert"
          >
            {printError}
          </p>
        ) : null}

        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto bg-slate-100 p-4 sm:p-8">
          <article
            id="technical-sheet-document"
            data-file-name={`ficha-tecnica-${product.sku}.pdf`}
            className="sheet mx-auto min-h-[1120px] max-w-[794px] border-t-[6px] border-primary bg-white px-8 py-7 shadow-sm"
          >
            <header className="sheet-header flex items-center justify-between gap-6 border-b pb-4">
              {/* The official asset is served locally; no third-party request is needed to print. */}
              <img
                className="sheet-logo h-auto w-44"
                src="/brand/cdr-logo.png"
                alt="Casa del Rulimán"
              />
              <div className="text-right">
                <p className="sheet-kicker text-[10px] font-extrabold uppercase tracking-[.1em] text-primary">
                  Ficha técnica comercial
                </p>
                <h1 className="mt-1 text-2xl font-bold leading-tight">{product.name}</h1>
                <p className="sheet-code mt-1 font-mono text-xs text-muted-foreground">
                  Código artículo {product.sku}
                </p>
              </div>
            </header>

            <div className="sheet-summary mt-5 grid gap-6 sm:grid-cols-[190px_1fr]">
              <div className="sheet-art overflow-hidden rounded-xl bg-[#f4f5f6] text-slate-600">
                <ProductArtwork category={sheet.schema.category.name} name={product.name} />
              </div>
              <div>
                <p className="sheet-description text-sm leading-6 text-muted-foreground">
                  {product.description ??
                    'Producto del catálogo maestro CDR. Consulte las especificaciones vigentes antes de seleccionar su aplicación.'}
                </p>
                <dl className="sheet-base mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    ['Marca', product.brand],
                    ['Categoría', sheet.schema.category.name],
                    [
                      'Plantilla',
                      `${sheet.schema.template.name} v${sheet.schema.template.version}`,
                    ],
                    ['Código unificador', unifiedCode ?? 'No registrado'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 text-xs font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <h2 className="sheet-section-title mt-7 text-xs font-extrabold uppercase tracking-[.08em] text-primary">
              Especificaciones publicables
            </h2>
            {attributes.length > 0 ? (
              <dl className="sheet-attributes grid grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-2">
                {attributes.map((attribute) => (
                  <div
                    key={attribute.key}
                    className="sheet-attribute border-b px-3 py-2.5 sm:odd:border-r"
                  >
                    <dt className="text-[10px] text-muted-foreground">{attribute.label}</dt>
                    <dd className="mt-1 break-words text-xs font-bold">{attribute.printable}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                No hay atributos exportables con valor para esta plantilla. Un administrador debe
                revisar la configuración antes de entregar la ficha.
              </div>
            )}

            <footer className="sheet-footer mt-6 border-t pt-3 text-[9px] leading-relaxed text-muted-foreground">
              Documento generado desde el catálogo maestro CDR. La identidad del SKU y la
              configuración de atributos se conservan en el PIM. Sistema mostrado:{' '}
              {unitSystem === 'metric' ? 'Métrico' : 'Imperial'}. Verifique la aplicación y la
              versión vigente antes de utilizar el producto.
            </footer>
          </article>
        </div>
      </section>
    </div>
  );
}
