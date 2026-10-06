'use client';

import type { CatalogGridColumnDto, ProductAttributeSheetDto } from '@cdr/contracts';
import {
  ExternalLink,
  FileArchive,
  FileText,
  ImageIcon,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductsData } from '@/components/use-products-data';
import { useWorkspaceData } from '@/components/use-workspace-data';
import { fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';

const assetPattern =
  /imagen|image|foto|fotografia|archivo|document|ficha|plano|certif|pdf|msds|hoja de seguridad|logo/iu;
const imagePattern = /imagen|image|foto|fotografia|logo/iu;

function attributeValue(sheet: ProductAttributeSheetDto, key: string): string {
  const value = sheet.product.attributes[key]?.value;
  return value === undefined || value === null || value === '' ? '' : String(value);
}

function isAsset(column: CatalogGridColumnDto): boolean {
  return assetPattern.test(`${column.key} ${column.label}`);
}

function isImage(column: CatalogGridColumnDto): boolean {
  return imagePattern.test(`${column.key} ${column.label}`);
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function DocumentsWorkspace() {
  const productsState = useProductsData({ page: 1, pageSize: 100 });
  const documentsState = useWorkspaceData('documents');
  const [productId, setProductId] = useState('');
  const [sheet, setSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId && productsState.products[0]) setProductId(productsState.products[0].id);
  }, [productId, productsState.products]);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setLoadingSheet(true);
    setSheetError(null);
    void fetchProductAttributeSheet(productId, controller.signal)
      .then(setSheet)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSheet(null);
        setSheetError(
          error instanceof Error ? error.message : 'No fue posible consultar la plantilla del SKU.',
        );
      })
      .finally(() => setLoadingSheet(false));
    return () => controller.abort();
  }, [productId]);

  const assets = useMemo(() => sheet?.schema.columns.filter(isAsset) ?? [], [sheet]);
  const images = assets.filter(isImage);
  const documents = assets.filter((column) => !isImage(column));
  const registered = assets.filter((column) => attributeValue(sheet!, column.key)).length;
  const selectedProduct = productsState.products.find((product) => product.id === productId);
  const storageMetric = documentsState.workspace?.metrics.find(
    (metric) => metric.key === 'storage',
  )?.value;

  const refresh = () => {
    productsState.reload();
    documentsState.reload();
    setProductId((current) => {
      if (!current) return current;
      setLoadingSheet(true);
      void fetchProductAttributeSheet(current)
        .then(setSheet)
        .catch((error: unknown) =>
          setSheetError(error instanceof Error ? error.message : 'No fue posible actualizar.'),
        )
        .finally(() => setLoadingSheet(false));
      return current;
    });
  };

  return (
    <>
      <PageHeader
        title="Imágenes y documentos"
        description="Activos técnicos y comerciales asociados al SKU y definidos por su plantilla."
        actions={
          <>
            <Button variant="outline" disabled title="El contrato ZIP aún no está aprobado">
              <FileArchive aria-hidden="true" className="size-4" /> Carga masiva (ZIP)
            </Button>
            <Button disabled title="La API de activos aún no está aprobada">
              <UploadCloud aria-hidden="true" className="size-4" /> Subir activo
            </Button>
          </>
        }
      />
      <ScreenGuide
        objective="Reúne imágenes y documentos requeridos por la plantilla del SKU, mostrando únicamente activos realmente registrados."
        actions={[
          'Cambia el SKU en contexto para revisar los activos que exige su plantilla.',
          'Distingue los activos registrados de los obligatorios todavía pendientes.',
          'Consulta el estado real del almacenamiento antes de habilitar cargas.',
        ]}
        dataSource="El SKU y su plantilla se consultan en la API dinámica del catálogo; el estado de persistencia y storage proviene del workspace autenticado de documentos."
        limitation="La carga individual y ZIP permanece deshabilitada hasta aprobar MIME, antivirus, versionado y persistencia de metadatos."
      />

      <Card className="mb-[18px] grid gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.55fr)_auto_auto] lg:items-end">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
            <ImageIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <small className="text-[10px] font-bold uppercase tracking-[.08em] text-primary">
              SKU en contexto
            </small>
            <strong className="block truncate text-sm">
              {selectedProduct?.sku ?? 'Selecciona un producto'}
            </strong>
            <span className="block truncate text-xs text-muted-foreground">
              {selectedProduct
                ? `${selectedProduct.brand} · ${sheet?.schema.template.name ?? selectedProduct.category}`
                : 'Sin contexto'}
            </span>
          </div>
        </div>
        <Select
          label="Cambiar SKU"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          disabled={productsState.loading}
        >
          {productsState.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.sku} · {product.brand} · {product.name}
            </option>
          ))}
        </Select>
        <Button variant="outline" onClick={refresh} disabled={loadingSheet}>
          <RefreshCw
            aria-hidden="true"
            className={loadingSheet ? 'size-4 animate-spin' : 'size-4'}
          />
          Actualizar
        </Button>
        <Button asChild variant="outline">
          <Link href="/publication?view=images">Imágenes PrestaShop</Link>
        </Button>
      </Card>

      <div className="mb-[18px] flex flex-col gap-3 rounded-xl border border-dashed border-orange-200 bg-orange-50/60 p-4 sm:flex-row sm:items-center">
        <FileArchive aria-hidden="true" className="size-7 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <strong className="block text-sm">¿Muchos archivos de varios SKU?</strong>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            La convención aprobada es <code>SKU__TIPO.ext</code>. La vista previa ZIP quedará
            disponible cuando el backend pueda validar, versionar y asociar cada archivo.
          </p>
        </div>
        <Button size="sm" disabled>
          Carga masiva (ZIP)
        </Button>
      </div>

      {productsState.loading || loadingSheet ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[125px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : productsState.error || sheetError ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar los activos del SKU"
          description={productsState.error ?? sheetError ?? 'Error desconocido'}
          actionLabel="Reintentar"
          onAction={refresh}
        />
      ) : sheet ? (
        <>
          <section
            className="mb-[18px] grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Indicadores de activos"
          >
            <MetricCard
              label="Activos de la plantilla"
              value={assets.length}
              note={sheet.schema.template.name}
              icon={FileText}
            />
            <MetricCard
              label="Registrados"
              value={registered}
              note="valores realmente persistidos"
              icon={FileText}
              tone="green"
            />
            <MetricCard
              label="Pendientes"
              value={Math.max(0, assets.length - registered)}
              note="sin archivo o enlace"
              icon={UploadCloud}
              tone="orange"
            />
            <MetricCard
              label="Almacenamiento"
              value={typeof storageMetric === 'string' ? storageMetric : 'No disponible'}
              note="estado informado por backend"
              icon={FileArchive}
              tone="blue"
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-[22px]">
              <h2 className="text-[17px] font-semibold">Imágenes · {images.length}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Solo se presentan atributos de imagen definidos por la plantilla.
              </p>
              {images.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {images.map((column) => {
                    const value = attributeValue(sheet, column.key);
                    const href = safeHttpUrl(value);
                    return (
                      <article
                        key={column.id}
                        className="rounded-xl border border-dashed bg-slate-50 p-3"
                      >
                        <div className="grid h-24 place-items-center rounded-lg bg-white text-slate-300">
                          <ImageIcon aria-hidden="true" className="size-9" />
                        </div>
                        <strong className="mt-3 block text-xs">{column.label}</strong>
                        <StatusBadge
                          tone={value ? 'success' : column.required ? 'danger' : 'warning'}
                        >
                          {value
                            ? 'Registrado'
                            : column.required
                              ? 'Obligatorio faltante'
                              : 'Pendiente'}
                        </StatusBadge>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                          >
                            Abrir enlace <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        ) : value ? (
                          <small
                            className="mt-2 block truncate text-muted-foreground"
                            title={value}
                          >
                            {value}
                          </small>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">
                  La plantilla no define atributos de imagen.
                </p>
              )}
            </Card>

            <Card className="p-[22px]">
              <h2 className="text-[17px] font-semibold">Documentos · {documents.length}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Fichas, certificados y archivos previstos en la plantilla activa.
              </p>
              <div className="mt-4 divide-y">
                {documents.length ? (
                  documents.map((column) => {
                    const value = attributeValue(sheet, column.key);
                    const href = safeHttpUrl(value);
                    return (
                      <div key={column.id} className="flex items-center gap-3 py-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                          <FileText aria-hidden="true" className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-xs">{column.label}</strong>
                          <small className="block truncate text-muted-foreground">
                            {value || 'Sin archivo asociado'}
                          </small>
                        </div>
                        <StatusBadge
                          tone={value ? 'success' : column.required ? 'danger' : 'warning'}
                        >
                          {value
                            ? 'Registrado'
                            : column.required
                              ? 'Obligatorio faltante'
                              : 'Pendiente'}
                        </StatusBadge>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                          >
                            Abrir <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">
                    La plantilla no define documentos para este SKU.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <StatePanel
          variant="empty"
          title="Selecciona un SKU"
          description="Elige un producto para consultar los activos definidos por su plantilla."
        />
      )}
    </>
  );
}
