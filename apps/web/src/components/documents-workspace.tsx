'use client';

import {
  PRODUCT_ASSET_MAX_BYTES,
  type ProductAssetBulkResultDto,
  type ProductAssetDto,
  type ProductAssetType,
} from '@cdr/contracts';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductsData } from '@/components/use-products-data';
import { fetchProduct } from '@/lib/catalog-api';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import {
  deleteProductAsset,
  listProductAssetsBatch,
  processProductAssetZip,
  productAssetDownloadUrl,
  uploadProductAsset,
} from '@/lib/product-assets-api';
import { downloadXlsx } from '@/lib/tabular-export';
import type { Product } from '@/lib/types';
import { cn } from '@/lib/utils';

const ASSET_TYPES: ReadonlyArray<{
  value: ProductAssetType;
  label: string;
  formats: string;
  accept: string;
}> = [
  {
    value: 'FOTO',
    label: 'Fotografía',
    formats: '.jpg .png .webp',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  },
  {
    value: 'PLANO',
    label: 'Plano',
    formats: '.pdf .png .jpg .dwg',
    accept: '.pdf,.png,.jpg,.jpeg,.dwg,application/pdf,image/png,image/jpeg,image/vnd.dwg',
  },
  { value: 'FT', label: 'Ficha técnica', formats: '.pdf', accept: '.pdf,application/pdf' },
  {
    value: 'MSDS',
    label: 'Ficha de seguridad',
    formats: '.pdf',
    accept: '.pdf,application/pdf',
  },
  {
    value: 'CERT',
    label: 'Certificado',
    formats: '.pdf .jpg .png',
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
];

type AssetMap = Readonly<Record<string, ProductAssetDto[]>>;

export function DocumentsWorkspace({ canWrite }: { canWrite: boolean }) {
  const [page, setPage] = useState(1);
  const [contextProductId, setContextProductId] = useState('');
  const [contextInitialized, setContextInitialized] = useState(false);
  const [contextProduct, setContextProduct] = useState<Product | null>(null);
  const [contextSettled, setContextSettled] = useState(false);
  // Keep the batch within its contractual limit while reserving one row for a deep-linked SKU.
  const productsPageSize = contextProduct ? 99 : 100;
  const productsState = useProductsData({ page, pageSize: productsPageSize });
  const [assetsByProduct, setAssetsByProduct] = useState<AssetMap>({});
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [baseData, setBaseData] = useState<
    Readonly<Record<string, { providerCode?: string; unifiedCode?: string }>>
  >({});
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [bulkResult, setBulkResult] = useState<ProductAssetBulkResultDto | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkRef = useRef<HTMLDivElement>(null);

  const catalogHasContext = productsState.products.some(
    (product) => product.id === contextProductId,
  );

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('productId') ?? '';
    setContextProductId(requested);
    setContextInitialized(true);
    if (!requested) setContextSettled(true);
  }, []);

  useEffect(() => {
    if (!contextInitialized) return;
    if (!contextProductId || catalogHasContext) {
      setContextProduct(null);
      setContextSettled(true);
      return;
    }
    if (productsState.loading) return;
    const controller = new AbortController();
    setContextSettled(false);
    void fetchProduct(contextProductId, controller.signal)
      .then(setContextProduct)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setContextProduct(null);
      })
      .finally(() => setContextSettled(true));
    return () => controller.abort();
  }, [catalogHasContext, contextInitialized, contextProductId, productsState.loading]);

  useEffect(() => {
    const controller = new AbortController();
    setBaseLoading(true);
    setBaseError(null);
    void fetchCatalogWorkbook({ page, pageSize: productsPageSize, filter: [] }, controller.signal)
      .then((result) => {
        setBaseData(
          Object.fromEntries(
            result.items.map((product) => [
              product.id,
              {
                providerCode: product.providerCode ?? undefined,
                unifiedCode: product.unifiedCode ?? undefined,
              },
            ]),
          ),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setBaseData({});
        setBaseError(
          error instanceof Error
            ? error.message
            : 'No fue posible consultar los códigos base del catálogo.',
        );
      })
      .finally(() => setBaseLoading(false));
    return () => controller.abort();
  }, [page, productsPageSize, revision]);

  const matrixProducts = useMemo(() => {
    const products: Product[] = [];
    const seen = new Set<string>();
    for (const product of [page === 1 ? contextProduct : null, ...productsState.products]) {
      if (!product || seen.has(product.id)) continue;
      // The reserved context row replaces (rather than duplicates) its natural paginated row.
      if (page > 1 && contextProduct && product.id === contextProduct.id) continue;
      const base = baseData[product.id];
      products.push({
        ...product,
        providerCode: base?.providerCode ?? product.providerCode,
        unifiedCode: base?.unifiedCode ?? product.unifiedCode,
      });
      seen.add(product.id);
      if (products.length === 100) break;
    }
    return products;
  }, [baseData, contextProduct, page, productsState.products]);
  const productIds = matrixProducts.map((product) => product.id);
  const batchKey = productIds.join(',');

  useEffect(() => {
    if (!batchKey) {
      setAssetsByProduct({});
      setAssetsLoading(false);
      return;
    }
    const controller = new AbortController();
    setAssetsLoading(true);
    setAssetsError(null);
    void listProductAssetsBatch(batchKey.split(','), controller.signal)
      .then((items) => {
        setAssetsByProduct(
          Object.fromEntries(items.map((item) => [item.productId, item.assets])) as AssetMap,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAssetsByProduct({});
        setAssetsError(
          error instanceof Error ? error.message : 'No fue posible consultar los activos.',
        );
      })
      .finally(() => setAssetsLoading(false));
    return () => controller.abort();
  }, [batchKey, revision]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    if (!normalized) return matrixProducts;
    return matrixProducts.filter((product) =>
      [product.sku, product.name, product.brand, product.providerCode, product.unifiedCode]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(normalized),
    );
  }, [matrixProducts, query]);

  const totals = useMemo(() => {
    const assets = matrixProducts.flatMap((product) => assetsByProduct[product.id] ?? []);
    return {
      assets: assets.length,
      productsWithAssets: new Set(assets.map((asset) => asset.productId)).size,
      missingSlots: matrixProducts.reduce(
        (total, product) =>
          total +
          ASSET_TYPES.filter(
            (type) =>
              !(assetsByProduct[product.id] ?? []).some((asset) => asset.type === type.value),
          ).length,
        0,
      ),
    };
  }, [assetsByProduct, matrixProducts]);

  const reload = () => {
    productsState.reload();
    setRevision((value) => value + 1);
  };

  const submitAsset = async (product: Product, type: ProductAssetType, file: File) => {
    if (file.size > PRODUCT_ASSET_MAX_BYTES) {
      setNotice({ tone: 'error', message: `${file.name} supera el máximo de 20 MB.` });
      return;
    }
    const slot = `${product.id}:${type}`;
    setUploadingSlot(slot);
    setNotice(null);
    try {
      const uploaded = await uploadProductAsset({ productId: product.id, type, file });
      setNotice({
        tone: 'success',
        message: `${uploaded.filename} quedó asociado a ${uploaded.sku}.`,
      });
      setRevision((value) => value + 1);
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible subir el activo.',
      });
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeAsset = async (asset: ProductAssetDto) => {
    if (!window.confirm(`¿Eliminar ${asset.filename} de ${asset.sku}?`)) return;
    setDeletingId(asset.id);
    setNotice(null);
    try {
      await deleteProductAsset(asset.id);
      setNotice({ tone: 'success', message: `${asset.filename} fue eliminado.` });
      setRevision((value) => value + 1);
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible eliminar el activo.',
      });
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
      if (mode === 'commit') {
        setRevision((value) => value + 1);
        setNotice({
          tone: result.errors ? 'error' : 'success',
          message: `${result.valid} archivo${result.valid === 1 ? '' : 's'} procesado${
            result.valid === 1 ? '' : 's'
          }; ${result.errors} con error.`,
        });
      }
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'No fue posible procesar el ZIP.');
    } finally {
      setBulkBusy(false);
    }
  };

  const exportMatrix = () => {
    downloadXlsx(
      {
        sheetName: 'Imagenes y documentos',
        headers: [
          'SKU',
          'Descripción',
          'Código de proveedor',
          'Código unificador',
          'Marca',
          ...ASSET_TYPES.map((type) => type.label),
        ],
        rows: filteredProducts.map((product) => {
          const assets = assetsByProduct[product.id] ?? [];
          return [
            product.sku,
            product.name,
            product.providerCode ?? '',
            product.unifiedCode ?? '',
            product.brand,
            ...ASSET_TYPES.map((type) =>
              assets
                .filter((asset) => asset.type === type.value)
                .map((asset) => asset.filename)
                .join(' · '),
            ),
          ];
        }),
      },
      'imagenes-y-documentos',
    );
  };

  const loading =
    productsState.loading || assetsLoading || baseLoading || !contextInitialized || !contextSettled;
  const error = productsState.error ?? assetsError;

  return (
    <>
      <PageHeader
        title="Imágenes y documentos"
        description="Vista matricial de activos persistidos por producto y datos base disponibles en el PIM."
        actions={
          <>
            <Button variant="outline" onClick={exportMatrix} disabled={!filteredProducts.length}>
              <FileSpreadsheet aria-hidden="true" className="size-4" /> Exportar Excel
            </Button>
            {canWrite ? (
              <Button onClick={() => bulkRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                <FileArchive aria-hidden="true" className="size-4" /> Carga masiva (ZIP)
              </Button>
            ) : null}
          </>
        }
      />
      <ScreenGuide
        objective="Consulta y gestiona en una sola tabla la fotografía, el plano, la ficha técnica, la ficha de seguridad y el certificado de cada SKU."
        actions={
          canWrite
            ? [
                'Busca por SKU, descripción, proveedor, código unificador o marca.',
                'Carga o reemplaza un archivo desde su celda; también puedes arrastrarlo sobre ella.',
                'Descarga o elimina cada activo persistido y usa el ZIP para cargas de varios SKU.',
              ]
            : [
                'Busca por los datos base disponibles del producto.',
                'Descarga los archivos persistidos desde la matriz.',
                'Solicita permiso de escritura para cargar o eliminar activos.',
              ]
        }
        dataSource="Los productos provienen del catálogo y los archivos activos de product_assets mediante una consulta batch autenticada; los binarios se sirven desde el storage privado."
        limitation="El contrato actual no persiste si un tipo documental aplica a una plantilla; por eso una celda vacía se muestra como pendiente y no como ‘No aplica’. El servidor valida firma, MIME, extensión, nombre y tamaño."
      />

      {!canWrite ? (
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Acceso de solo lectura: puedes consultar, exportar y descargar, pero no modificar activos.
        </p>
      ) : null}
      {notice ? (
        <p
          className={cn(
            'mb-4 rounded-lg p-3 text-sm',
            notice.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800',
          )}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      ) : null}
      {baseError ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          La matriz sigue disponible, pero no fue posible completar los códigos de proveedor y
          unificador: {baseError}
        </p>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="block min-w-0 flex-1 text-xs font-semibold lg:max-w-xl">
            Buscar en productos y datos base
            <span className="relative mt-2 block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <Input
                className="pl-9"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="SKU, descripción, proveedor, unificador o marca"
              />
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge tone="info">{filteredProducts.length} SKU visibles</StatusBadge>
            <StatusBadge tone="success">{totals.assets} activos</StatusBadge>
            <StatusBadge tone="neutral">{totals.productsWithAssets} SKU con archivos</StatusBadge>
            <StatusBadge tone={totals.missingSlots ? 'warning' : 'success'}>
              {totals.missingSlots} slots pendientes
            </StatusBadge>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw
                aria-hidden="true"
                className={loading ? 'size-4 animate-spin' : 'size-4'}
              />
              Actualizar
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-[460px] rounded-xl" aria-label="Cargando matriz de documentos" />
      ) : error ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar la matriz de documentos"
          description={error}
          actionLabel="Reintentar"
          onAction={reload}
        />
      ) : filteredProducts.length === 0 ? (
        <StatePanel
          variant="empty"
          title="Sin productos para esta búsqueda"
          description="Prueba con otro SKU, descripción, proveedor, código unificador o marca."
          actionLabel="Limpiar búsqueda"
          onAction={() => setQuery('')}
        />
      ) : (
        <Card className="mb-[18px] min-w-0 max-w-full overflow-hidden p-0">
          <div
            className="max-w-full overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Matriz de documentos desplazable"
          >
            <table className="w-full min-w-[1420px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_#e5e7eb]">
                <tr className="bg-orange-50 text-[10px] font-bold uppercase tracking-[.06em] text-orange-700">
                  <th className="sticky left-0 z-30 border-r bg-orange-50 px-3 py-2" rowSpan={2}>
                    Código artículo
                  </th>
                  <th className="px-3 py-2" colSpan={5}>
                    Imagen y datos base ERP · solo lectura
                  </th>
                  <th className="border-l px-3 py-2" colSpan={5}>
                    Documentos · cargar o arrastrar a la celda
                  </th>
                  <th className="border-l px-3 py-2" rowSpan={2}>
                    Control
                  </th>
                </tr>
                <tr className="text-[10px] uppercase text-slate-500">
                  <th className="px-3 py-2">Imagen</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2">Código de proveedor</th>
                  <th className="px-3 py-2">Código unificador</th>
                  <th className="px-3 py-2">Marca</th>
                  {ASSET_TYPES.map((type) => (
                    <th className="border-l px-3 py-2" key={type.value} title={type.formats}>
                      {type.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProducts.map((product) => {
                  const assets = assetsByProduct[product.id] ?? [];
                  const photo = assets.find(
                    (asset) => asset.type === 'FOTO' && asset.mimeType.startsWith('image/'),
                  );
                  const completed = ASSET_TYPES.filter((type) =>
                    assets.some((asset) => asset.type === type.value),
                  ).length;
                  const inContext = product.id === contextProductId;
                  return (
                    <tr
                      key={product.id}
                      className={cn('align-top hover:bg-slate-50', inContext && 'bg-orange-50/50')}
                    >
                      <th className="sticky left-0 z-10 w-40 border-r bg-white px-3 py-3 shadow-[1px_0_0_#e5e7eb]">
                        <Link
                          className="font-mono text-[11px] font-bold text-primary hover:underline"
                          href={`/products/${encodeURIComponent(product.id)}`}
                        >
                          {product.sku}
                        </Link>
                        {inContext ? (
                          <span className="mt-1 block text-[9px] font-bold uppercase tracking-wide text-orange-600">
                            SKU en contexto
                          </span>
                        ) : null}
                      </th>
                      <td className="w-20 px-3 py-2">
                        <div className="relative grid size-14 place-items-center overflow-hidden rounded-md border bg-slate-50 text-slate-300">
                          {photo ? (
                            <Image
                              src={`${productAssetDownloadUrl(photo.id)}?inline=true`}
                              alt={`Fotografía de ${product.sku}`}
                              fill
                              unoptimized
                              className="object-contain"
                            />
                          ) : (
                            <ImageIcon aria-hidden="true" className="size-5" />
                          )}
                        </div>
                      </td>
                      <td className="max-w-60 px-3 py-3 font-medium" title={product.name}>
                        <span className="line-clamp-2">{product.name}</span>
                      </td>
                      <ReadOnlyCell value={product.providerCode} />
                      <ReadOnlyCell value={product.unifiedCode} />
                      <ReadOnlyCell value={product.brand} />
                      {ASSET_TYPES.map((type) => (
                        <AssetSlotCell
                          key={type.value}
                          product={product}
                          type={type}
                          assets={assets.filter((asset) => asset.type === type.value)}
                          canWrite={canWrite}
                          uploading={uploadingSlot === `${product.id}:${type.value}`}
                          deletingId={deletingId}
                          onUpload={submitAsset}
                          onDelete={removeAsset}
                        />
                      ))}
                      <td className="border-l px-3 py-3 text-center">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-1 font-bold',
                            completed === ASSET_TYPES.length
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {completed}/{ASSET_TYPES.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t bg-slate-50 px-4 py-3 text-[11px] text-muted-foreground">
            Fotografía: .jpg .png .webp · plano: .pdf .png .jpg .dwg · fichas: .pdf · certificado:
            .pdf .jpg .png · máximo 20 MB por archivo. Los guiones indican un dato base no informado
            por el contrato actual.
          </p>
          {productsState.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <span className="mr-2 text-xs text-muted-foreground">
                Página {productsState.page} de {productsState.totalPages} · {productsState.total}{' '}
                productos
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={productsState.page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft aria-hidden="true" className="size-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={productsState.page >= productsState.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Siguiente <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      {canWrite ? (
        <BulkUploadPanel
          ref={bulkRef}
          zipFile={zipFile}
          result={bulkResult}
          busy={bulkBusy}
          error={bulkError}
          onFile={(next) => {
            setZipFile(next);
            setBulkResult(null);
            setBulkError(null);
          }}
          onProcess={processZip}
        />
      ) : null}
    </>
  );
}

function ReadOnlyCell({ value }: { value?: string }) {
  return (
    <td
      className="max-w-44 px-3 py-3 text-slate-600"
      title={value || 'No informado por el contrato actual'}
    >
      <span className="line-clamp-2">{value || '—'}</span>
    </td>
  );
}

function AssetSlotCell({
  product,
  type,
  assets,
  canWrite,
  uploading,
  deletingId,
  onUpload,
  onDelete,
}: {
  product: Product;
  type: (typeof ASSET_TYPES)[number];
  assets: readonly ProductAssetDto[];
  canWrite: boolean;
  uploading: boolean;
  deletingId: string | null;
  onUpload: (product: Product, type: ProductAssetType, file: File) => Promise<void>;
  onDelete: (asset: ProductAssetDto) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = (file: File | undefined) => {
    if (!file || !canWrite || uploading) return;
    void onUpload(product, type.value, file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <td
      className={cn(
        'w-52 border-l px-2 py-2 transition-colors',
        assets.length ? 'bg-emerald-50/30' : 'bg-amber-50/20',
        dragging && 'bg-orange-100 ring-2 ring-inset ring-orange-400',
      )}
      onDragOver={
        canWrite
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={canWrite ? () => setDragging(false) : undefined}
      onDrop={
        canWrite
          ? (event) => {
              event.preventDefault();
              setDragging(false);
              upload(event.dataTransfer.files[0]);
            }
          : undefined
      }
      title={canWrite ? `Arrastra aquí ${type.formats}` : undefined}
    >
      <div className="space-y-1.5">
        {assets.length ? (
          <div className="max-h-24 space-y-1 overflow-y-auto">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex min-w-0 items-center gap-1 rounded border bg-white px-1.5 py-1"
              >
                {asset.kind === 'image' ? (
                  <ImageIcon aria-hidden="true" className="size-3 shrink-0 text-emerald-600" />
                ) : (
                  <FileText aria-hidden="true" className="size-3 shrink-0 text-emerald-600" />
                )}
                <span className="min-w-0 flex-1 truncate text-[10px]" title={asset.filename}>
                  {asset.filename}
                </span>
                <a
                  className="grid size-6 shrink-0 place-items-center rounded hover:bg-slate-100"
                  href={productAssetDownloadUrl(asset.id)}
                  aria-label={`Descargar ${asset.filename}`}
                >
                  <Download aria-hidden="true" className="size-3" />
                </a>
                {canWrite ? (
                  <button
                    type="button"
                    className="grid size-6 shrink-0 place-items-center rounded hover:bg-red-50"
                    disabled={deletingId === asset.id}
                    onClick={() => void onDelete(asset)}
                    aria-label={`Eliminar ${asset.filename}`}
                  >
                    <Trash2 aria-hidden="true" className="size-3 text-red-600" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <span className="block text-[10px] text-amber-700">Pendiente</span>
        )}
        {canWrite ? (
          <label className="relative inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-primary hover:bg-orange-50">
            <UploadCloud aria-hidden="true" className="size-3" />
            {uploading
              ? 'Subiendo…'
              : assets.length && type.value !== 'FOTO'
                ? 'Reemplazar'
                : 'Cargar'}
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept={type.accept}
              disabled={uploading}
              aria-label={`Cargar ${type.label} de ${product.sku}`}
              onChange={(event) => upload(event.target.files?.[0])}
            />
          </label>
        ) : null}
      </div>
    </td>
  );
}

const BulkUploadPanel = forwardRef<
  HTMLDivElement,
  {
    zipFile: File | null;
    result: ProductAssetBulkResultDto | null;
    busy: boolean;
    error: string | null;
    onFile: (file: File | null) => void;
    onProcess: (mode: 'validate' | 'commit') => Promise<void>;
  }
>(function BulkUploadPanel({ zipFile, result, busy, error, onFile, onProcess }, ref) {
  return (
    <Card ref={ref} className="min-w-0 max-w-full p-[22px]">
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
            <code>SKU__TIPO.ext</code> o <code>SKU__TIPO__detalle.ext</code>. Tipos: FT, MSDS, CERT,
            PLANO y FOTO-1, FOTO-2… Para nombres libres incluye <code>manifiesto.csv</code> con{' '}
            <code>archivo;codigo_articulo;tipo</code>.
          </div>
          <label className="block text-xs font-semibold">
            Archivo ZIP
            <input
              className="mt-2 block w-full rounded-md border bg-white p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-primary"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Máximo 100 MB, 250 entradas y 20 MB por archivo. Se bloquean ZIP64, cifrado, rutas
            inseguras y expansión anómala.
          </p>
          <Button
            variant="outline"
            className="w-full"
            disabled={!zipFile || busy}
            onClick={() => void onProcess('validate')}
          >
            <FileCheck2 className="size-4" aria-hidden="true" />{' '}
            {busy ? 'Procesando…' : 'Validar ZIP'}
          </Button>
          {result?.mode === 'validate' ? (
            <Button
              className="w-full"
              disabled={busy || result.valid === 0}
              onClick={() => void onProcess('commit')}
            >
              <UploadCloud className="size-4" aria-hidden="true" /> Confirmar carga · {result.valid}{' '}
              archivo{result.valid === 1 ? '' : 's'}
            </Button>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <BulkResult result={result} />
      </div>
    </Card>
  );
});

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
