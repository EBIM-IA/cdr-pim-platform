'use client';

import type { ProductAssetBulkResultDto, ProductAssetDto, ProductAssetType } from '@cdr/contracts';
import {
  Download,
  FileArchive,
  FileCheck2,
  FileText,
  ImageIcon,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import {
  deleteProductAsset,
  listProductAssets,
  processProductAssetZip,
  productAssetDownloadUrl,
  uploadProductAsset,
} from '@/lib/product-assets-api';

const ASSET_TYPES: ReadonlyArray<{
  value: ProductAssetType;
  label: string;
  formats: string;
  accept: string;
}> = [
  { value: 'FT', label: 'Ficha técnica', formats: '.pdf', accept: '.pdf,application/pdf' },
  {
    value: 'MSDS',
    label: 'Ficha de seguridad MSDS',
    formats: '.pdf',
    accept: '.pdf,application/pdf',
  },
  {
    value: 'CERT',
    label: 'Certificado',
    formats: '.pdf .jpg .png',
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
  {
    value: 'PLANO',
    label: 'Plano',
    formats: '.pdf .png .jpg .dwg',
    accept: '.pdf,.png,.jpg,.jpeg,.dwg,application/pdf,image/png,image/jpeg',
  },
  {
    value: 'FOTO',
    label: 'Fotografía del producto',
    formats: '.jpg .png .webp',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  },
];

export function DocumentsWorkspace({ canWrite }: { canWrite: boolean }) {
  const productsState = useProductsData({ page: 1, pageSize: 100 });
  const [productId, setProductId] = useState('');
  const [initialSelectionApplied, setInitialSelectionApplied] = useState(false);
  const [assets, setAssets] = useState<ProductAssetDto[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [type, setType] = useState<ProductAssetType>('FT');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [bulkResult, setBulkResult] = useState<ProductAssetBulkResultDto | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const individualRef = useRef<HTMLDivElement>(null);
  const bulkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialSelectionApplied) return;
    const requested = new URLSearchParams(window.location.search).get('productId');
    if (requested) {
      setProductId(requested);
      setInitialSelectionApplied(true);
      return;
    }
    if (productsState.products[0]) {
      setProductId(productsState.products[0].id);
      setInitialSelectionApplied(true);
    } else if (!productsState.loading) {
      setInitialSelectionApplied(true);
    }
  }, [initialSelectionApplied, productsState.loading, productsState.products]);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setAssetsLoading(true);
    setAssetsError(null);
    setAssets([]);
    void listProductAssets({ productId }, controller.signal)
      .then(setAssets)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAssets([]);
        setAssetsError(
          error instanceof Error ? error.message : 'No fue posible consultar los activos.',
        );
      })
      .finally(() => setAssetsLoading(false));
    return () => controller.abort();
  }, [productId, revision]);

  const selectedProduct = productsState.products.find((product) => product.id === productId);
  const images = useMemo(() => assets.filter((asset) => asset.kind === 'image'), [assets]);
  const documents = useMemo(() => assets.filter((asset) => asset.kind === 'document'), [assets]);
  const totalBytes = assets.reduce((total, asset) => total + asset.size, 0);
  const selectedType = ASSET_TYPES.find((entry) => entry.value === type) ?? ASSET_TYPES[0]!;

  const reload = () => {
    productsState.reload();
    setRevision((value) => value + 1);
  };

  const submitAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!productId || !file) return;
    setUploading(true);
    setMutationError(null);
    setMutationMessage(null);
    try {
      const uploaded = await uploadProductAsset({ productId, type, file });
      setFile(null);
      setMutationMessage(`${uploaded.filename} quedó asociado a ${uploaded.sku}.`);
      setRevision((value) => value + 1);
      const input = document.querySelector<HTMLInputElement>('#individual-asset-file');
      if (input) input.value = '';
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'No fue posible subir el activo.');
    } finally {
      setUploading(false);
    }
  };

  const removeAsset = async (asset: ProductAssetDto) => {
    if (!window.confirm(`¿Eliminar ${asset.filename} de ${asset.sku}?`)) return;
    setDeletingId(asset.id);
    setMutationError(null);
    try {
      await deleteProductAsset(asset.id);
      setMutationMessage(`${asset.filename} fue eliminado.`);
      setRevision((value) => value + 1);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'No fue posible eliminar el activo.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const processZip = async (mode: 'validate' | 'commit') => {
    if (!zipFile) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const result = await processProductAssetZip(zipFile, mode);
      setBulkResult(result);
      if (mode === 'commit') setRevision((value) => value + 1);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'No fue posible procesar el ZIP.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Imágenes y documentos"
        description="Carga, consulta y elimina activos reales asociados a cada SKU."
        actions={
          canWrite ? (
            <>
              <Button
                variant="outline"
                onClick={() => bulkRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                <FileArchive aria-hidden="true" className="size-4" /> Carga masiva (ZIP)
              </Button>
              <Button onClick={() => individualRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                <UploadCloud aria-hidden="true" className="size-4" /> Subir activo
              </Button>
            </>
          ) : undefined
        }
      />
      <ScreenGuide
        objective="Gestiona imágenes, fichas, certificados y planos por SKU con metadatos persistidos y contenido privado en el storage configurado."
        actions={
          canWrite
            ? [
                'Selecciona un SKU y carga un activo individual de hasta 20 MB.',
                'Descarga o elimina los archivos registrados con permisos del catálogo.',
                'Valida un ZIP por archivo antes de confirmar su carga parcial.',
              ]
            : [
                'Selecciona un SKU para consultar sus activos registrados.',
                'Descarga imágenes o documentos desde el storage privado.',
                'Solicita permiso de escritura para cargar o eliminar activos.',
              ]
        }
        dataSource="La lista proviene de product_assets; los binarios se leen desde @cdr/storage (memoria local o S3 según configuración)."
        limitation="El ZIP admite hasta 100 MB y 250 entradas. No se ejecuta antivirus en esta versión; la firma binaria, MIME, extensión, nombre y rutas sí se validan en el servidor."
      />

      {!canWrite ? (
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Acceso de solo lectura: puedes consultar y descargar activos, pero no modificarlos.
        </p>
      ) : null}

      <Card className="mb-[18px] grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.7fr)_auto] lg:items-end">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
            <ImageIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <small className="text-[10px] font-bold uppercase tracking-[.08em] text-primary">
              SKU en contexto
            </small>
            <strong className="block truncate text-sm">
              {selectedProduct?.sku ?? assets[0]?.sku ?? 'Selecciona un producto'}
            </strong>
            <span className="block truncate text-xs text-muted-foreground">
              {selectedProduct
                ? `${selectedProduct.brand} · ${selectedProduct.name}`
                : productId
                  ? 'Producto seleccionado fuera de la página actual'
                  : 'Sin contexto'}
            </span>
          </div>
        </div>
        <Select
          label="Cambiar SKU"
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setMutationMessage(null);
            setMutationError(null);
          }}
          disabled={productsState.loading}
        >
          {productId && !selectedProduct ? (
            <option value={productId}>{assets[0]?.sku ?? productId} · Producto seleccionado</option>
          ) : null}
          {productsState.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.sku} · {product.brand} · {product.name}
            </option>
          ))}
        </Select>
        <Button variant="outline" onClick={reload} disabled={assetsLoading}>
          <RefreshCw
            aria-hidden="true"
            className={assetsLoading ? 'size-4 animate-spin' : 'size-4'}
          />
          Actualizar
        </Button>
      </Card>

      {mutationMessage ? (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {mutationMessage}
        </p>
      ) : null}
      {mutationError ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {mutationError}
        </p>
      ) : null}

      <section
        className="mb-[18px] grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicadores de activos"
      >
        <MetricCard
          label="Activos registrados"
          value={assets.length}
          note="metadatos activos"
          icon={FileCheck2}
        />
        <MetricCard
          label="Imágenes"
          value={images.length}
          note="fotografías del SKU"
          icon={ImageIcon}
          tone="green"
        />
        <MetricCard
          label="Documentos"
          value={documents.length}
          note="fichas, planos y certificados"
          icon={FileText}
          tone="orange"
        />
        <MetricCard
          label="Tamaño almacenado"
          value={formatBytes(totalBytes)}
          note="suma del SKU seleccionado"
          icon={FileArchive}
          tone="blue"
        />
      </section>

      <div className="mb-[18px] grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <div className="space-y-4">
          {productsState.loading || assetsLoading ? (
            <Skeleton className="h-80 rounded-xl" aria-label="Cargando activos" />
          ) : productsState.error || assetsError ? (
            <StatePanel
              variant="error"
              title="No pudimos cargar los activos del SKU"
              description={productsState.error ?? assetsError ?? 'Error desconocido'}
              actionLabel="Reintentar"
              onAction={reload}
            />
          ) : (
            <>
              <Card className="p-[22px]">
                <h2 className="text-[17px] font-semibold">Imágenes · {images.length}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fotografías realmente registradas para el SKU.
                </p>
                {images.length ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {images.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        deleting={deletingId === asset.id}
                        onDelete={canWrite ? removeAsset : undefined}
                        preview
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">
                    Este SKU no tiene fotografías registradas.
                  </p>
                )}
              </Card>
              <Card className="p-[22px]">
                <h2 className="text-[17px] font-semibold">Documentos · {documents.length}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fichas, MSDS, certificados y planos persistidos.
                </p>
                {documents.length ? (
                  <div className="mt-4 divide-y">
                    {documents.map((asset) => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        deleting={deletingId === asset.id}
                        onDelete={canWrite ? removeAsset : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">
                    Este SKU no tiene documentos registrados.
                  </p>
                )}
              </Card>
            </>
          )}
        </div>

        {canWrite ? (
          <Card ref={individualRef} className="h-fit p-[22px]">
            <h2 className="text-[17px] font-semibold">Subir activo individual</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Un documento por tipo; una nueva carga reemplaza el anterior. Las fotografías se
              agregan en orden.
            </p>
            <form className="mt-5 space-y-4" onSubmit={submitAsset}>
              <Select
                label="Tipo de activo"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as ProductAssetType);
                  setFile(null);
                }}
              >
                {ASSET_TYPES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.value} · {entry.label}
                  </option>
                ))}
              </Select>
              <label className="block text-xs font-semibold">
                Archivo
                <input
                  id="individual-asset-file"
                  className="mt-2 block w-full rounded-md border bg-white p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-primary"
                  type="file"
                  accept={selectedType.accept}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  required
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Formatos: {selectedType.formats} · máximo 20 MB. El servidor verifica la firma real
                del archivo.
              </p>
              <Button className="w-full" type="submit" disabled={!file || !productId || uploading}>
                <UploadCloud className="size-4" aria-hidden="true" />
                {uploading ? 'Subiendo…' : 'Subir y asociar'}
              </Button>
            </form>
          </Card>
        ) : null}
      </div>

      {canWrite ? (
        <Card ref={bulkRef} className="p-[22px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-[17px] font-semibold">Carga masiva de documentos e imágenes</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Valida el ZIP completo y confirma únicamente los archivos válidos.
              </p>
            </div>
            <StatusBadge tone="info">Por SKU · carga parcial</StatusBadge>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(300px,.7fr)_minmax(0,1.3fr)]">
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-xs leading-5 text-slate-700">
                <strong className="block text-sm">Convención</strong>
                <code>SKU__TIPO.ext</code> o <code>SKU__TIPO__detalle.ext</code>. Tipos: FT, MSDS,
                CERT, PLANO y FOTO-1, FOTO-2… Para nombres libres incluye{' '}
                <code>manifiesto.csv</code> con <code>archivo;codigo_articulo;tipo</code>.
              </div>
              <label className="block text-xs font-semibold">
                Archivo ZIP
                <input
                  className="mt-2 block w-full rounded-md border bg-white p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-primary"
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={(event) => {
                    setZipFile(event.target.files?.[0] ?? null);
                    setBulkResult(null);
                    setBulkError(null);
                  }}
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Máximo 100 MB, 250 entradas y 20 MB por archivo. Se bloquean ZIP64, cifrado, rutas
                inseguras y expansión anómala.
              </p>
              <Button
                variant="outline"
                className="w-full"
                disabled={!zipFile || bulkBusy}
                onClick={() => void processZip('validate')}
              >
                <FileCheck2 className="size-4" aria-hidden="true" />{' '}
                {bulkBusy ? 'Procesando…' : 'Validar ZIP'}
              </Button>
              {bulkResult?.mode === 'validate' ? (
                <Button
                  className="w-full"
                  disabled={bulkBusy || bulkResult.valid === 0}
                  onClick={() => void processZip('commit')}
                >
                  <UploadCloud className="size-4" aria-hidden="true" /> Confirmar carga ·{' '}
                  {bulkResult.valid} archivo{bulkResult.valid === 1 ? '' : 's'}
                </Button>
              ) : null}
              {bulkError ? (
                <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800" role="alert">
                  {bulkError}
                </p>
              ) : null}
            </div>
            <BulkResult result={bulkResult} />
          </div>
        </Card>
      ) : null}
    </>
  );
}

function AssetCard({
  asset,
  deleting,
  onDelete,
  preview,
}: {
  asset: ProductAssetDto;
  deleting: boolean;
  onDelete?: (asset: ProductAssetDto) => void;
  preview?: boolean;
}) {
  const url = productAssetDownloadUrl(asset.id);
  return (
    <article className="overflow-hidden rounded-xl border bg-white">
      <div className="relative grid h-32 place-items-center bg-slate-100 text-slate-300">
        {preview ? (
          <Image
            src={`${url}?inline=true`}
            alt={asset.filename}
            fill
            unoptimized
            className="object-contain"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-9" />
        )}
      </div>
      <div className="p-3">
        <strong className="block truncate text-xs" title={asset.filename}>
          {asset.filename}
        </strong>
        <small className="mt-1 block text-muted-foreground">
          {formatBytes(asset.size)} · {formatDate(asset.uploadedAt)}
        </small>
        <div className="mt-3 flex gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={url}>
              <Download className="size-3" aria-hidden="true" /> Descargar
            </a>
          </Button>
          {onDelete ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={deleting}
              onClick={() => onDelete(asset)}
              aria-label={`Eliminar ${asset.filename}`}
            >
              <Trash2 className="size-3 text-red-600" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AssetRow({
  asset,
  deleting,
  onDelete,
}: {
  asset: ProductAssetDto;
  deleting: boolean;
  onDelete?: (asset: ProductAssetDto) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-primary">
        <FileText aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-48 flex-1">
        <strong className="block truncate text-xs" title={asset.filename}>
          {asset.filename}
        </strong>
        <small className="block text-muted-foreground">
          {asset.type} · {formatBytes(asset.size)} · {formatDate(asset.uploadedAt)}
        </small>
      </div>
      <StatusBadge tone={asset.source === 'bulk' ? 'info' : 'success'}>
        {asset.source === 'bulk' ? 'Carga ZIP' : 'Carga individual'}
      </StatusBadge>
      <Button asChild size="sm" variant="outline">
        <a href={productAssetDownloadUrl(asset.id)}>
          <Download className="size-3" aria-hidden="true" /> Descargar
        </a>
      </Button>
      {onDelete ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={deleting}
          onClick={() => onDelete(asset)}
          aria-label={`Eliminar ${asset.filename}`}
        >
          <Trash2 className="size-4 text-red-600" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function BulkResult({ result }: { result: ProductAssetBulkResultDto | null }) {
  if (!result)
    return (
      <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
        Selecciona un ZIP y valida su contenido para ver el resultado archivo por archivo.
      </div>
    );
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <StatusBadge tone="info">{result.total} archivos</StatusBadge>
        <StatusBadge tone="success">{result.valid} válidos</StatusBadge>
        <StatusBadge tone={result.errors ? 'danger' : 'success'}>
          {result.errors} errores
        </StatusBadge>
        <StatusBadge tone="warning">{result.affectedSkus} SKU</StatusBadge>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Archivo</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Resultado</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.items.map((item, index) => (
              <tr key={`${item.filename}-${index}`}>
                <td className="max-w-56 truncate px-3 py-2 font-mono" title={item.filename}>
                  {item.filename}
                </td>
                <td className="px-3 py-2">{item.sku ?? '—'}</td>
                <td className="px-3 py-2">{item.type ?? '—'}</td>
                <td className="px-3 py-2">
                  <BulkStatus status={item.status} />
                </td>
                <td className="max-w-64 px-3 py-2 text-muted-foreground">{item.message ?? 'OK'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BulkStatus({ status }: { status: ProductAssetBulkResultDto['items'][number]['status'] }) {
  const labels = {
    ready: 'Nuevo',
    will_replace: 'Reemplaza',
    uploaded: 'Cargado',
    replaced: 'Reemplazado',
    error: 'Error',
    ignored: 'Ignorado',
  } as const;
  const tone =
    status === 'error'
      ? 'danger'
      : status === 'ignored'
        ? 'neutral'
        : status === 'will_replace' || status === 'replaced'
          ? 'warning'
          : 'success';
  return <StatusBadge tone={tone}>{labels[status]}</StatusBadge>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value));
}
