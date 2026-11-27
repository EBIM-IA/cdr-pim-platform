'use client';

import {
  ECOMMERCE_IMAGE_LOOKUP_LIMIT,
  type CatalogWorkbookProductDto,
  type EcommerceImageDto,
  type EcommerceImageErrorDto,
  type EcommerceImageHistoryDto,
  type EcommerceImageImportItemDto,
  type EcommerceImageLookupItemDto,
  type EcommerceImageMode,
  type EcommerceImageTarget,
} from '@cdr/contracts';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  fetchEcommerceImageHistory,
  fetchEcommerceImageStatus,
  importEcommerceImage,
  lookupEcommerceImages,
} from '@/lib/ecommerce-images-api';
import { formatWorkspaceDateTime } from '@/lib/workspace-view';

type PIMSku = Pick<CatalogWorkbookProductDto, 'id' | 'sku'>;
type BatchTarget = EcommerceImageTarget & { pimSku: string };
type FoundItem = Extract<EcommerceImageLookupItemDto, { status: 'found' }>;

function imageKey(productId: string, assetId: string): string {
  return `${productId}/${assetId}`;
}

function byGalleryOrder(a: EcommerceImageDto, b: EcommerceImageDto): number {
  return Number(b.cover) - Number(a.cover) || a.position - b.position;
}

function documentsUrl(productId?: string): string {
  return productId ? `/documents?productId=${encodeURIComponent(productId)}` : '/documents';
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function imageError({ message, correlationId }: EcommerceImageErrorDto): string {
  return correlationId ? `${message} Referencia ${correlationId}.` : message;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="space-y-3 p-4">{children}</div>
    </Card>
  );
}

function ImportHistory({
  items,
  error,
  retry,
}: {
  items: EcommerceImageHistoryDto['items'] | null;
  error: string | null;
  retry: () => void;
}) {
  return (
    <Section title="Historial de importación de imágenes">
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700">
          {error}
          <Button variant="outline" size="sm" onClick={retry}>
            Reintentar historial
          </Button>
        </div>
      ) : null}
      {!items && !error ? <p role="status">Cargando historial…</p> : null}
      {items?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin migraciones registradas.</p>
      ) : null}
      {items?.length ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="border-b bg-slate-50">
              <tr>
                {['SKU PIM', 'SKU ecommerce', 'Archivo', 'Fecha', 'Estado'].map((label) => (
                  <th key={label} scope="col" className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.assetId} className="border-b last:border-0">
                  <td className="p-2">
                    <a className="text-primary underline" href={documentsUrl(item.productId)}>
                      {item.pimSku}
                    </a>
                  </td>
                  <td className="p-2">{item.ecommerceSku}</td>
                  <td className="p-2">{item.filename}</td>
                  <td className="p-2">{formatWorkspaceDateTime(item.importedAt)}</td>
                  <td className="p-2">{item.active ? 'En galería' : 'Retirada'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

function GalleryResult({
  item,
  images,
  open,
  canImport,
  working,
  checked,
  results,
  toggle,
}: {
  item: FoundItem;
  images: EcommerceImageDto[];
  open: boolean;
  canImport: boolean;
  working: boolean;
  checked: ReadonlySet<string>;
  results: ReadonlyMap<string, EcommerceImageImportItemDto>;
  toggle: (id: string, selected: boolean) => void;
}) {
  return (
    <details open={open} className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {item.pimSku ?? item.ecommerceSku} · {images.length}{' '}
        {images.length === 1 ? 'imagen' : 'imágenes'}
      </summary>
      {item.ecommerceSku !== item.pimSku ? (
        <p className="mt-2 text-xs text-muted-foreground">SKU ecommerce {item.ecommerceSku}</p>
      ) : null}
      {images.length ? (
        <ul className="mt-2 divide-y">
          {images.map((image) => {
            const key = imageKey(item.productId, image.assetId);
            const result = results.get(key);
            const saved = result?.status === 'imported' || result?.status === 'existing';
            return (
              <li
                key={image.assetId}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <label className="flex min-w-0 items-start gap-2 break-all">
                  {canImport && image.canImport && !saved ? (
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary"
                      checked={checked.has(key)}
                      disabled={working}
                      onChange={(event) => toggle(key, event.target.checked)}
                      aria-label={`Seleccionar ${image.filename} de ${item.pimSku ?? item.ecommerceSku}`}
                    />
                  ) : null}
                  {image.filename}
                  {image.cover ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      Portada
                    </span>
                  ) : null}
                </label>
                <div className="text-xs text-muted-foreground">
                  {result?.status === 'imported' ? 'Importada al PIM' : null}
                  {result?.status === 'existing' ? 'Ya estaba en el PIM' : null}
                  {result?.status === 'error' ? (
                    <span className="text-red-700">{imageError(result.error)}</span>
                  ) : null}
                  {!image.canImport ? 'Formato o tamaño fuera de lo admitido por el PIM' : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">El SKU no tiene imágenes.</p>
      )}
    </details>
  );
}

export function EcommerceImagesWorkspace({
  selected,
  canQuery,
  canImport,
  children,
}: {
  selected: PIMSku | undefined;
  canQuery: boolean;
  canImport: boolean;
  children: ReactNode;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusRevision, setStatusRevision] = useState(0);
  const [draftSkus, setDraftSkus] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<EcommerceImageMode>('resolved');
  const [batch, setBatch] = useState<BatchTarget[]>([]);
  const [lookup, setLookup] = useState<{
    items: EcommerceImageLookupItemDto[];
    mode: EcommerceImageMode;
  } | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [importResults, setImportResults] = useState<
    ReadonlyMap<string, EcommerceImageImportItemDto>
  >(new Map());
  const [history, setHistory] = useState<EcommerceImageHistoryDto['items'] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [phase, setPhase] = useState<'lookup' | 'import' | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const stopAfterCurrent = useRef(false);

  useEffect(() => {
    if (!canQuery) return;
    const controller = new AbortController();
    void fetchEcommerceImageStatus(controller.signal)
      .then(({ configured }) => {
        if (!controller.signal.aborted) setConfigured(configured);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setStatusError(errorText(cause, 'No se pudo consultar la configuración de Narviz.'));
        }
      });
    return () => controller.abort();
  }, [canQuery, statusRevision]);

  useEffect(() => {
    if (!canQuery) return;
    const controller = new AbortController();
    void fetchEcommerceImageHistory(controller.signal)
      .then(({ items }) => {
        if (!controller.signal.aborted) setHistory(items);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryError(errorText(cause, 'No se pudo cargar el historial de importación.'));
        }
      });
    return () => controller.abort();
  }, [canQuery, historyRevision]);

  useEffect(() => () => operation.current?.abort(), []);

  const draft = selected ? (draftSkus[selected.id] ?? '') : '';
  const invalidDraft = draft.length > 0 && draft.trim().length === 0;
  const working = phase !== null;
  const target: EcommerceImageTarget | null = selected
    ? { productId: selected.id, ...(draft && { ecommerceSku: draft }) }
    : null;
  const inBatch = batch.find((item) => item.productId === selected?.id);
  const canAdd =
    target &&
    selected &&
    !invalidDraft &&
    (inBatch
      ? inBatch.ecommerceSku !== target.ecommerceSku
      : batch.length < ECOMMERCE_IMAGE_LOOKUP_LIMIT);

  async function runLookup(targets: EcommerceImageTarget[]) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setPhase('lookup');
    setOperationError(null);
    try {
      const { items } = await lookupEcommerceImages({ targets, mode }, controller.signal);
      if (controller.signal.aborted) return;
      setLookup({ items, mode });
      setChecked(new Set());
      setImportResults(new Map());
      setProgress(null);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setOperationError(errorText(cause, 'No se pudieron consultar las imágenes.'));
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setPhase(null);
    }
  }

  const importable = (lookup?.items ?? []).flatMap((item) => {
    if (item.status !== 'found') return [];
    return item.images
      .filter((image) => {
        const result = importResults.get(imageKey(item.productId, image.assetId));
        return image.canImport && result?.status !== 'imported' && result?.status !== 'existing';
      })
      .sort(byGalleryOrder)
      .map((image) => ({ item, image, key: imageKey(item.productId, image.assetId) }));
  });

  function reloadHistory() {
    setHistoryError(null);
    setHistoryRevision((revision) => revision + 1);
  }

  async function runImport() {
    if (!lookup || operation.current) return;
    const requested = importable.filter(({ key }) => checked.has(key));
    if (!requested.length) return;
    const controller = new AbortController();
    operation.current = controller;
    stopAfterCurrent.current = false;
    setStopping(false);
    setPhase('import');
    setOperationError(null);
    setProgress({ completed: 0, total: requested.length });
    try {
      let completed = 0;
      for (const { item, image, key } of requested) {
        const { items } = await importEcommerceImage(
          {
            target: {
              productId: item.productId,
              ...(item.ecommerceSku && { ecommerceSku: item.ecommerceSku }),
            },
            mode: lookup.mode,
            assets: [{ assetId: image.assetId, checksumSha256: image.checksumSha256 }],
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const result = items[0];
        if (!result || result.assetId !== image.assetId) {
          throw new Error('No se pudo confirmar el resultado de la imagen solicitada.');
        }
        setImportResults((previous) => new Map(previous).set(key, result));
        if (result.status !== 'error') {
          setChecked((previous) => {
            const next = new Set(previous);
            next.delete(key);
            return next;
          });
        }
        completed += 1;
        setProgress({ completed, total: requested.length });
        if (
          result.status === 'error' &&
          ['ECOMMERCE_AUTH', 'ECOMMERCE_RATE_LIMIT', 'ECOMMERCE_UNAVAILABLE'].includes(
            result.error.code,
          )
        ) {
          setOperationError(
            'La importación se detuvo. Las imágenes pendientes siguen seleccionadas.',
          );
          break;
        }
        if (stopAfterCurrent.current) break;
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setOperationError(errorText(cause, 'No se pudo completar la importación de imágenes.'));
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) {
        setPhase(null);
        setStopping(false);
        reloadHistory();
      }
    }
  }

  const found = lookup?.items.filter((item) => item.status === 'found') ?? [];
  const withImages = found.filter(({ images }) => images.length > 0).length;
  const metrics = [
    ['SKU analizados', lookup?.items.length],
    ['Con imagen', lookup ? withImages : undefined],
    ['Sin imágenes', lookup ? found.length - withImages : undefined],
    ['Errores', lookup ? lookup.items.length - found.length : undefined],
  ] as const;

  return (
    <div className="space-y-4">
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicadores de migración de imágenes"
      >
        {metrics.map(([label, value]) => (
          <Card key={label} className="p-4">
            <small className="text-muted-foreground">{label}</small>
            <strong className="mt-1 block text-xl">{value ?? '—'}</strong>
          </Card>
        ))}
      </section>
      <Section title="Consulta de imágenes por SKU">
        {children}
        {statusError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700">
            {statusError}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusError(null);
                setStatusRevision((value) => value + 1);
              }}
            >
              Reintentar conexión
            </Button>
          </div>
        ) : null}
        {canQuery && configured === null && !statusError ? (
          <p role="status" className="text-sm">
            Consultando configuración de Narviz…
          </p>
        ) : null}
        {configured === false ? (
          <p className="text-sm text-muted-foreground">
            La integración con Narviz está pendiente de configuración.
          </p>
        ) : null}
        {configured && canQuery ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground">
                SKU ecommerce (opcional)
                <Input
                  className="font-normal text-foreground"
                  value={draft}
                  disabled={!selected || working}
                  maxLength={128}
                  placeholder={selected?.sku}
                  aria-invalid={invalidDraft}
                  onChange={(event) => {
                    if (!selected) return;
                    const value = event.target.value;
                    setDraftSkus((previous) => ({ ...previous, [selected.id]: value }));
                  }}
                />
              </label>
              <Select
                label="Imágenes a consultar"
                disabled={working}
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value === 'own' ? 'own' : 'resolved');
                }}
              >
                <option value="resolved">Todas las disponibles</option>
                <option value="own">Solo fotografías propias</option>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!target || invalidDraft || working}
                onClick={() => {
                  if (target) void runLookup([target]);
                }}
              >
                Consultar imágenes
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canAdd || working}
                onClick={() => {
                  if (!target || !selected) return;
                  const item = { ...target, pimSku: selected.sku };
                  setBatch((previous) =>
                    inBatch
                      ? previous.map((row) => (row.productId === item.productId ? item : row))
                      : [...previous, item],
                  );
                }}
              >
                {inBatch ? 'Actualizar SKU del lote' : 'Añadir SKU al lote'}
              </Button>
            </div>
            {batch.length ? (
              <div className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-semibold">
                  SKU del lote ({batch.length}/{ECOMMERCE_IMAGE_LOOKUP_LIMIT})
                </h3>
                <ul className="flex flex-wrap gap-2" aria-label="SKU del lote">
                  {batch.map((item) => (
                    <li
                      key={item.productId}
                      className="inline-flex max-w-full items-center gap-2 rounded border px-2 text-xs"
                    >
                      <span className="break-all">
                        {item.pimSku}
                        {item.ecommerceSku ? ` · ${item.ecommerceSku}` : ''}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={working}
                        aria-label={`Quitar ${item.pimSku} del lote`}
                        onClick={() =>
                          setBatch((previous) =>
                            previous.filter(({ productId }) => productId !== item.productId),
                          )
                        }
                      >
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={working}
                  onClick={() => {
                    void runLookup(
                      batch.map(({ productId, ecommerceSku }) => ({ productId, ecommerceSku })),
                    );
                  }}
                >
                  Consultar lote
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <a href={documentsUrl(selected?.id)}>Ver activos del SKU en PIM</a>
        </Button>
        {phase === 'lookup' ? (
          <p role="status" className="text-sm">
            Consultando imágenes en Narviz…
          </p>
        ) : null}
        {operationError && !lookup ? (
          <p role="alert" className="text-sm text-red-700">
            {operationError}
          </p>
        ) : null}
      </Section>
      {lookup ? (
        <Section title="Resultados de la consulta">
          <p className="text-xs text-muted-foreground">
            {lookup.mode === 'own' ? 'Solo fotografías propias' : 'Todas las imágenes disponibles'}
          </p>
          {lookup.items.map((item) =>
            item.status === 'error' ? (
              <div key={item.productId} className="rounded-md border p-3 text-sm">
                <strong>{item.pimSku ?? item.ecommerceSku ?? 'SKU PIM no disponible'}</strong>
                <p className="mt-1 text-red-700">{imageError(item.error)}</p>
              </div>
            ) : (
              <GalleryResult
                key={item.productId}
                item={item}
                images={[...item.images].sort(byGalleryOrder)}
                open={lookup.items.length === 1}
                canImport={canImport}
                working={working}
                checked={checked}
                results={importResults}
                toggle={(key, selected) =>
                  setChecked((previous) => {
                    const next = new Set(previous);
                    if (selected) next.add(key);
                    else next.delete(key);
                    return next;
                  })
                }
              />
            ),
          )}
          {configured && canImport && importable.length ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={working || checked.size === importable.length}
                onClick={() => setChecked(new Set(importable.map(({ key }) => key)))}
              >
                Seleccionar imágenes disponibles
              </Button>
              <Button
                size="sm"
                disabled={working || checked.size === 0}
                onClick={() => void runImport()}
              >
                Importar selección al PIM ({checked.size})
              </Button>
            </div>
          ) : null}
          {progress ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <p role="status">
                {progress.completed} de {progress.total} imágenes procesadas.
              </p>
              {phase === 'import' ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={stopping}
                  onClick={() => {
                    stopAfterCurrent.current = true;
                    setStopping(true);
                  }}
                >
                  {stopping ? 'Deteniendo importación…' : 'Detener después de esta imagen'}
                </Button>
              ) : null}
            </div>
          ) : null}
          {operationError ? (
            <p role="alert" className="text-sm text-red-700">
              {operationError}
            </p>
          ) : null}
        </Section>
      ) : null}
      {canQuery ? (
        <ImportHistory items={history} error={historyError} retry={reloadHistory} />
      ) : null}
    </div>
  );
}
