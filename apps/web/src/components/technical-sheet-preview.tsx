'use client';

import type { ProductAttributeSheetDto, ProductAssetDto } from '@cdr/contracts';
import { Download, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ProductThumbnail } from '@/components/product-thumbnail';
import { Button } from '@/components/ui/button';
import {
  downloadTechnicalSheetPdf,
  technicalSheetDocument,
  technicalSheetMedia,
  technicalSheetLogo,
  technicalSheetBrand,
} from '@/lib/technical-sheet-export';
import { fetchProductTechnicalSheet } from '@/lib/dynamic-catalog-api';
import { technicalAttributesFromSheet, unifiedCodeFromSheet } from '@/lib/product-detail-data';
import type { Product } from '@/lib/types';
import { displayMeasurement, type MeasurementSystem } from '@/lib/units';

interface TechnicalSheetPreviewProps {
  readonly open: boolean;
  readonly product: Product;
  readonly sheet: ProductAttributeSheetDto;
  readonly unitSystem: MeasurementSystem;
  readonly onClose: () => void;
  readonly assets?: readonly ProductAssetDto[];
  readonly commercialCopy?: { titulo: string; descripcion: string } | null;
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

export function TechnicalSheetPreview({
  open,
  product,
  sheet,
  unitSystem,
  onClose,
  assets = [],
  commercialCopy,
}: TechnicalSheetPreviewProps) {
  const [printError, setPrintError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [brandInfo, setBrandInfo] = useState<{ brandLogo?: string; brandDescription?: string }>({});
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void technicalSheetBrand(product.brand, controller.signal)
      .then(setBrandInfo)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setPrintError(
            failure instanceof Error ? failure.message : 'No se pudo consultar la marca.',
          );
      });
    return () => controller.abort();
  }, [open, product.brand]);
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
              disabled={downloading}
              onClick={() => {
                setPrintError(null);
                setDownloading(true);
                void Promise.all([
                  fetchProductTechnicalSheet(product.id),
                  technicalSheetLogo(),
                  technicalSheetMedia(assets),
                  technicalSheetBrand(product.brand),
                ])
                  .then(async ([current, cdrLogo, media, brand]) => {
                    await downloadTechnicalSheetPdf({
                      ...technicalSheetDocument(current, unitSystem),
                      cdrLogo,
                      media,
                      ...brand,
                      ...(commercialCopy
                        ? { name: commercialCopy.titulo, description: commercialCopy.descripcion }
                        : product.description
                          ? { description: product.description }
                          : {}),
                    });
                  })
                  .catch((error: unknown) => {
                    setPrintError(
                      error instanceof Error
                        ? error.message
                        : 'No fue posible generar la ficha PDF.',
                    );
                  })
                  .finally(() => setDownloading(false));
              }}
            >
              <Download aria-hidden="true" className="size-4" />{' '}
              {downloading ? 'Generando PDF…' : 'Descargar PDF'}
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
                className="sheet-logo h-auto w-44 rounded bg-[#222222] p-2"
                src="/brand/cdr-logo.png"
                alt="Casa del Rulimán"
              />
              <div className="text-right">
                <p className="sheet-kicker text-[10px] font-extrabold uppercase tracking-[.1em] text-primary">
                  Ficha técnica comercial
                </p>
                <h1 className="mt-1 text-2xl font-bold leading-tight">
                  {commercialCopy?.titulo ?? product.name}
                </h1>
                <p className="sheet-code mt-1 font-mono text-xs text-muted-foreground">
                  Código artículo {product.sku}
                </p>
              </div>
            </header>

            <div className="sheet-summary mt-5 grid gap-6 sm:grid-cols-[190px_1fr]">
              <div className="sheet-art overflow-hidden rounded-xl bg-[#f4f5f6] text-slate-600">
                <ProductThumbnail
                  product={{ ...product, category: sheet.schema.category.name }}
                  assets={assets}
                />
              </div>
              <div>
                <p className="sheet-description text-sm leading-6 text-muted-foreground">
                  {commercialCopy?.descripcion ??
                    product.description ??
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

            {brandInfo.brandLogo || brandInfo.brandDescription ? (
              <section className="mt-5 border-t pt-4">
                <h2 className="text-xs font-bold text-primary">Información de marca</h2>
                {brandInfo.brandLogo ? (
                  <img
                    src={brandInfo.brandLogo}
                    alt={`Logo de ${product.brand}`}
                    className="mt-2 max-h-14 max-w-36 object-contain"
                  />
                ) : null}
                {brandInfo.brandDescription ? (
                  <p className="mt-2 text-xs text-muted-foreground">{brandInfo.brandDescription}</p>
                ) : null}
              </section>
            ) : null}

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
