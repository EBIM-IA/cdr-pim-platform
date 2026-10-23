'use client';

import {
  PRODUCT_ASSET_MAX_BYTES,
  type CatalogCategorySummaryDto,
  type ProductAssetBulkResultDto,
  type ProductAssetDto,
  type ProductAssetType,
} from '@cdr/contracts';
import {
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

import { matchesAxFilterExpression } from '@/components/excel-table-filter';
import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { fetchCatalogCategories } from '@/lib/dynamic-catalog-api';
import {
  documentCoverage,
  documentFilterValue,
  documentRequirement,
  documentState,
  fetchDocumentsCatalog,
  type DocumentAssets,
  type DocumentProduct,
} from '@/lib/documents-view';
import {
  deleteProductAsset,
  processProductAssetZip,
  productAssetDownloadUrl,
  uploadProductAsset,
} from '@/lib/product-assets-api';
import { downloadXlsx } from '@/lib/tabular-export';
import { cn } from '@/lib/utils';

import styles from './documents-workspace.module.css';

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
  { value: 'MSDS', label: 'Ficha de seguridad', formats: '.pdf', accept: '.pdf,application/pdf' },
  {
    value: 'CERT',
    label: 'Certificado',
    formats: '.pdf .jpg .png',
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
];
const BASE_COLUMNS = [
  { key: 'name', label: 'Descripción' },
  { key: 'category', label: 'Categoría' },
  { key: 'providerCode', label: 'Código de proveedor' },
  { key: 'unifiedCode', label: 'Código unificador' },
  { key: 'application', label: 'Tipo de aplicación' },
  { key: 'brand', label: 'Marca de artículo' },
] as const;

export function DocumentsWorkspace({ canWrite }: { canWrite: boolean }) {
  const [products, setProducts] = useState<DocumentProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategorySummaryDto[]>([]);
  const [assetsByProduct, setAssetsByProduct] = useState<DocumentAssets>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [view, setView] = useState<'table' | 'context'>('table');
  const [selectedId, setSelectedId] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [uploadingSlots, setUploadingSlots] = useState<ReadonlySet<string>>(new Set());
  const pendingUploads = useRef(new Set<string>());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [bulkResult, setBulkResult] = useState<ProductAssetBulkResultDto | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const validatedZip = useRef<File | null>(null);
  const bulkInFlight = useRef(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('productId');
    if (requested) {
      setSelectedId(requested);
      setView('context');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      fetchDocumentsCatalog(controller.signal),
      fetchCatalogCategories(controller.signal).catch(() => []),
    ])
      .then(([catalog, categoryRows]) => {
        if (controller.signal.aborted) return;
        setProducts(catalog.products);
        setAssetsByProduct(catalog.assets);
        setCategories(categoryRows);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'No fue posible consultar los documentos.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  const selectedProduct =
    products.find((product) => product.id === selectedId) ??
    (!selectedId ? products[0] : undefined);
  const selectedAssets = selectedProduct ? (assetsByProduct[selectedProduct.id] ?? []) : [];
  const selectedCoverage = selectedProduct
    ? documentCoverage(selectedProduct, selectedAssets)
    : null;
  const categoryPath = (product: DocumentProduct) => {
    const category = categories.find((entry) => entry.id === product.category?.id);
    return category?.ancestors?.length
      ? [
          ...category.ancestors.map((entry) => entry.name),
          ...(category.ancestors.at(-1)?.name === category.name ? [] : [category.name]),
        ].join(' › ')
      : category?.path?.replace(/\s*\/\s*/gu, ' › ') || product.category?.name || '';
  };
  const baseValue = (product: DocumentProduct, key: string): string => {
    if (key === 'category') return categoryPath(product);
    if (key === 'application') return product.applicationTypes.join(' E ');
    if (key === 'coverage') {
      const coverage = documentCoverage(product, assetsByProduct[product.id] ?? []);
      return coverage ? `${coverage.present}/${coverage.total}` : '—';
    }
    if (ASSET_TYPES.some((type) => type.value === key))
      return documentState(product, key as ProductAssetType, assetsByProduct[product.id] ?? []);
    return String(product[key as 'sku' | 'name' | 'providerCode' | 'unifiedCode' | 'brand'] ?? '');
  };
  // All pages have been loaded before this local filter, so exports and AX filters share the same rows.
  const filteredProducts = products.filter((product) => {
    const text = [product.sku, ...BASE_COLUMNS.map((column) => baseValue(product, column.key))]
      .join(' ')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es');
    const search = query
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es');
    if (search && !text.includes(search)) return false;
    return Object.entries(filters).every(([key, expression]) => {
      const value = ASSET_TYPES.some((type) => type.value === key)
        ? documentFilterValue(
            product,
            key as ProductAssetType,
            assetsByProduct[product.id] ?? [],
            expression,
          )
        : baseValue(product, key) || '(Vacías)';
      return matchesAxFilterExpression(value, expression);
    });
  });
  const totals = useMemo(
    () => ({
      requested: products.reduce(
        (sum, product) => sum + (product.assetRequirements?.length ?? 0),
        0,
      ),
      files: Object.values(assetsByProduct).reduce((sum, assets) => sum + assets.length, 0),
    }),
    [products, assetsByProduct],
  );
  const reload = () => setRevision((value) => value + 1);
  const submitAsset = async (product: DocumentProduct, type: ProductAssetType, file: File) => {
    if (!canWrite || !documentRequirement(product, type)) return;
    if (file.size > PRODUCT_ASSET_MAX_BYTES) {
      setNotice({ tone: 'error', message: `${file.name} supera el máximo de 20 MB.` });
      return;
    }
    const slot = `${product.id}:${type}`;
    if (pendingUploads.current.has(slot)) return;
    pendingUploads.current.add(slot);
    setUploadingSlots(new Set(pendingUploads.current));
    setNotice(null);
    try {
      const uploaded = await uploadProductAsset({ productId: product.id, type, file });
      setNotice({
        tone: 'success',
        message: `${uploaded.filename} quedó asociado a ${uploaded.sku}.`,
      });
      reload();
    } catch (cause) {
      setNotice({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'No fue posible subir el activo.',
      });
    } finally {
      pendingUploads.current.delete(slot);
      setUploadingSlots(new Set(pendingUploads.current));
    }
  };
  const removeAsset = async (asset: ProductAssetDto) => {
    if (!canWrite || !window.confirm(`¿Eliminar ${asset.filename} de ${asset.sku}?`)) return;
    setDeletingId(asset.id);
    setNotice(null);
    try {
      await deleteProductAsset(asset.id);
      setNotice({ tone: 'success', message: `${asset.filename} fue eliminado.` });
      reload();
    } catch (cause) {
      setNotice({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'No fue posible eliminar el activo.',
      });
    } finally {
      setDeletingId(null);
    }
  };
  const processZip = async (mode: 'validate' | 'commit') => {
    if (!canWrite || !zipFile || bulkInFlight.current) return;
    const archive = zipFile;
    if (mode === 'commit' && validatedZip.current !== archive) {
      setBulkError('Valida este archivo ZIP antes de confirmar su carga.');
      return;
    }
    validatedZip.current = null;
    if (mode === 'validate') setBulkResult(null);
    bulkInFlight.current = true;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const result = await processProductAssetZip(archive, mode);
      validatedZip.current = mode === 'validate' ? archive : null;
      setBulkResult(result);
      if (mode === 'commit') {
        reload();
        setNotice({
          tone: result.errors ? 'error' : 'success',
          message: `${result.valid} archivos procesados; ${result.errors} con error.`,
        });
      }
    } catch (cause) {
      setBulkResult(null);
      setBulkError(cause instanceof Error ? cause.message : 'No fue posible procesar el ZIP.');
    } finally {
      bulkInFlight.current = false;
      setBulkBusy(false);
    }
  };
  const exportMatrix = () =>
    downloadXlsx(
      {
        sheetName: 'Imagenes y documentos',
        headers: [
          'Código artículo',
          ...BASE_COLUMNS.map((column) => column.label),
          ...ASSET_TYPES.map((type) => type.label),
          'Documentos',
        ],
        rows: filteredProducts.map((product) => [
          product.sku,
          ...BASE_COLUMNS.map((column) => baseValue(product, column.key)),
          ...ASSET_TYPES.map((type) =>
            documentState(product, type.value, assetsByProduct[product.id] ?? []),
          ),
          baseValue(product, 'coverage'),
        ]),
      },
      'imagenes-y-documentos',
    );
  const slotProps = {
    canWrite,
    uploadingSlots,
    deletingId,
    onUpload: submitAsset,
    onDelete: removeAsset,
  };
  const filterInput = (key: string, label: string) => (
    <input
      className={styles.filter}
      type="text"
      aria-label={`Filtrar ${label} (sintaxis AX)`}
      placeholder="Filtrar"
      value={filters[key] ?? ''}
      onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
    />
  );

  return (
    <>
      <PageHeader
        title="Imágenes y Documentos"
        description="Activos técnicos y comerciales asociados al SKU."
      />
      <ScreenGuide
        objective="Consulta los archivos y requisitos documentales de la plantilla de cada SKU."
        actions={[
          'Alterna entre la tabla de todos los SKU y los archivos del SKU en contexto.',
          'Filtra cualquier columna con sintaxis AX; usa comillas dobles para encontrar celdas sin archivo.',
          ...(canWrite
            ? ['Carga desde la celda o valida un ZIP antes de confirmar su carga.']
            : ['Descarga los archivos disponibles con acceso de solo lectura.']),
        ]}
        dataSource="Catálogo completo autorizado, requisitos activos de las plantillas y archivos persistidos en el servidor."
        limitation="Los enlaces o textos importados no equivalen a un archivo cargado. La publicación en PrestaShop requiere un conector habilitado."
      />
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Vista de imágenes y documentos">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'table'}
            onClick={() => setView('table')}
          >
            Todos los SKU · tabla <span>{products.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'context'}
            onClick={() => setView('context')}
          >
            SKU en contexto{selectedProduct ? ` · ${selectedProduct.sku}` : ''}
          </button>
        </div>
        <div
          className={styles.actions}
          role="toolbar"
          aria-label="Acciones de imágenes y documentos"
        >
          {canWrite ? (
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <FileArchive className="size-3.5" aria-hidden="true" /> Carga masiva (ZIP)
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !!error || !filteredProducts.length}
            onClick={exportMatrix}
          >
            <FileSpreadsheet className="size-3.5" aria-hidden="true" /> Exportar Excel
          </Button>
          <a
            className={styles.example}
            href="/templates/documentos_ejemplo.zip"
            download
            title="Ejemplo de estructura: sustituye el SKU y adjunta tus archivos reales"
          >
            ZIP de ejemplo
          </a>
          <label className={styles.search}>
            <Search className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Buscar SKU</span>
            <Input
              type="search"
              placeholder="Buscar SKU, descripción, marca…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Actualizar documentos"
            disabled={loading}
            onClick={reload}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {!canWrite ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Acceso de solo lectura: consulta, exporta y descarga los archivos disponibles.
        </p>
      ) : null}
      {notice ? (
        <p
          className={cn(
            'mb-3 rounded-lg p-3 text-xs',
            notice.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800',
          )}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      ) : null}
      {loading ? (
        <Skeleton className="h-[520px] rounded-xl" aria-label="Cargando matriz de documentos" />
      ) : error ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar la matriz de documentos"
          description={error}
          actionLabel="Reintentar"
          onAction={reload}
        />
      ) : view === 'table' ? (
        <Card className={styles.card}>
          <div className={styles.tableHeading}>
            <h2>
              Imágenes y Documentos ·{' '}
              {filteredProducts.length === products.length
                ? `${products.length} SKU`
                : `${filteredProducts.length} de ${products.length} SKU`}
            </h2>
            <p>
              Una fila por SKU. Los documentos se asocian al atributo de la plantilla de cada SKU.{' '}
              {totals.requested} documentos que piden las plantillas · {totals.files} archivos en el
              servidor
            </p>
            <div className={styles.legend}>
              <span>
                <i className={styles.loadedSwatch} /> Cargado
              </span>
              <span>
                <i className={styles.requiredSwatch} /> Obligatorio sin archivo o valor no válido
              </span>
              <span>
                <i className={styles.naSwatch} /> No aplica a la plantilla
              </span>
            </div>
          </div>
          <div className={styles.filterHelp}>
            <span title={'Filtros AX: *texto*, prefijo*, !valor, A|B y "" para vacías.'}>
              ⓘ Filtros AX por columna
            </span>
            <span role="status">
              {filteredProducts.length} filas
              {Object.values(filters).some(Boolean) ? (
                <button type="button" onClick={() => setFilters({})}>
                  Limpiar filtros
                </button>
              ) : null}
            </span>
          </div>
          <div
            className={styles.scroll}
            tabIndex={0}
            role="region"
            aria-label="Matriz de documentos desplazable"
          >
            <table className={styles.table}>
              <colgroup>
                {[145, 56, 220, 220, 220, 128, 170, 156, 245, 245, 245, 245, 245, 110].map(
                  (width, index) => (
                    <col key={index} style={{ width }} />
                  ),
                )}
              </colgroup>
              <thead>
                <tr className={styles.groups}>
                  <th>SKU</th>
                  <th colSpan={7}>Imagen y Datos Base ERP · Solo Lectura</th>
                  <th colSpan={5}>Documentos · «Cargar» o arrastra el archivo a la celda</th>
                  <th>Control</th>
                </tr>
                <tr>
                  <th>Código artículo</th>
                  <th>Imagen</th>
                  {BASE_COLUMNS.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  {ASSET_TYPES.map((type) => (
                    <th key={type.value} title={type.formats}>
                      {type.label}
                    </th>
                  ))}
                  <th>Documentos</th>
                </tr>
                <tr>
                  <th>{filterInput('sku', 'Código artículo')}</th>
                  <th />
                  {BASE_COLUMNS.map((column) => (
                    <th key={column.key}>{filterInput(column.key, column.label)}</th>
                  ))}
                  {ASSET_TYPES.map((type) => (
                    <th key={type.value}>{filterInput(type.value, type.label)}</th>
                  ))}
                  <th>{filterInput('coverage', 'Documentos')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const assets = assetsByProduct[product.id] ?? [];
                  const coverage = documentCoverage(product, assets);
                  return (
                    <tr key={product.id}>
                      <th>
                        <Link href={`/products/${encodeURIComponent(product.id)}`}>
                          {product.sku}
                        </Link>
                      </th>
                      <td>
                        <ProductPhoto product={product} assets={assets} />
                      </td>
                      {BASE_COLUMNS.map((column) => (
                        <td
                          key={column.key}
                          className={styles.erp}
                          title={baseValue(product, column.key)}
                        >
                          <span>{baseValue(product, column.key) || '—'}</span>
                        </td>
                      ))}
                      {ASSET_TYPES.map((type) => (
                        <AssetSlotCell
                          key={type.value}
                          product={product}
                          type={type}
                          assets={assets.filter((asset) => asset.type === type.value)}
                          {...slotProps}
                        />
                      ))}
                      <td className={styles.coverage}>
                        <span data-missing={!!coverage?.requiredMissing}>
                          {coverage ? `${coverage.present}/${coverage.total}` : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!filteredProducts.length ? (
                  <tr>
                    <td colSpan={14} className="p-10 text-center text-muted-foreground">
                      Sin productos para esta búsqueda.{' '}
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={() => {
                          setQuery('');
                          setFilters({});
                        }}
                      >
                        Limpiar búsqueda y filtros
                      </button>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className={styles.footnote}>
            Formatos: fotografía .jpg .jpeg .png .webp · plano .pdf .png .jpg .dwg · fichas .pdf ·
            certificado .pdf .jpg .png · máx. 20 MB. Los archivos se guardan en el servidor. Filtro
            AX: «&quot;&quot;» muestra los SKU sin ese archivo.
          </p>
        </Card>
      ) : (
        <>
          <div className={styles.skuBar}>
            <label>
              SKU en contexto
              <select
                value={selectedProduct?.id ?? ''}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  const url = new URL(window.location.href);
                  url.searchParams.set('productId', event.target.value);
                  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                }}
              >
                {!selectedProduct ? <option value="">Selecciona un SKU</option> : null}
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} · {product.name}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {selectedProduct?.brand || '—'} ·{' '}
              {selectedProduct?.template?.name || 'Sin plantilla activa'}
            </span>
            {selectedProduct ? (
              <Link href={`/products/${encodeURIComponent(selectedProduct.id)}`}>
                Ver ficha del producto →
              </Link>
            ) : null}
          </div>
          {selectedProduct ? (
            <>
              {canWrite ? (
                <div className={styles.bulkCallout}>
                  <FileArchive aria-hidden="true" className="size-5" />
                  <span>
                    <strong>¿Varios archivos de varios SKU?</strong> Valida un ZIP y revisa el
                    resultado antes de confirmar la carga.
                  </span>
                  <Button size="sm" onClick={() => setBulkOpen(true)}>
                    Carga masiva (ZIP)
                  </Button>
                </div>
              ) : null}
              <div className={styles.metrics}>
                {[
                  ['Activos en plantilla', selectedCoverage?.total ?? '—'],
                  ['Registrados', selectedCoverage?.present ?? '—'],
                  [
                    'Pendientes',
                    selectedCoverage ? selectedCoverage.total - selectedCoverage.present : '—',
                  ],
                  ['Imágenes PrestaShop', 'Sin conexión'],
                ].map(([label, value]) => (
                  <Card key={label} className="p-4">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <strong className="mt-1 block text-xl">{value}</strong>
                  </Card>
                ))}
              </div>
              <div className={styles.contextColumns}>
                <Card className="min-w-0 p-5">
                  <div className={styles.contextTitle}>
                    <h2>Imágenes</h2>
                    <Link href="/publication?view=images">Imágenes PrestaShop →</Link>
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Fotografías registradas del SKU y plano técnico.
                  </p>
                  <div className={styles.gallery}>
                    {selectedAssets
                      .filter((asset) => asset.kind === 'image')
                      .map((asset) => (
                        <figure key={asset.id}>
                          <div className="relative aspect-square">
                            <Image
                              src={`${productAssetDownloadUrl(asset.id)}?inline=true`}
                              alt={asset.filename}
                              fill
                              unoptimized
                              className="object-contain"
                            />
                          </div>
                          <figcaption>{asset.filename}</figcaption>
                        </figure>
                      ))}
                    {!selectedAssets.some((asset) => asset.kind === 'image') ? (
                      <div className={styles.emptyPhoto}>
                        <ImageIcon className="size-10" aria-hidden="true" />
                        <span>Sin imágenes registradas</span>
                      </div>
                    ) : null}
                  </div>
                  <table className={styles.contextAssets}>
                    <tbody>
                      {ASSET_TYPES.slice(0, 2).map((type) => (
                        <tr key={type.value}>
                          <th>{type.label}</th>
                          <AssetSlotCell
                            product={selectedProduct}
                            type={type}
                            assets={selectedAssets.filter((asset) => asset.type === type.value)}
                            {...slotProps}
                          />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <Card className="min-w-0 p-5">
                  <div className={styles.contextTitle}>
                    <h2>Documentos</h2>
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Requisitos de la plantilla · archivos asociados a {selectedProduct.sku}.
                  </p>
                  <table className={styles.contextAssets}>
                    <tbody>
                      {ASSET_TYPES.slice(2).map((type) => (
                        <tr key={type.value}>
                          <th>
                            {type.label}
                            <small>
                              {documentRequirement(selectedProduct, type.value)?.required
                                ? 'Obligatorio'
                                : type.formats}
                            </small>
                          </th>
                          <AssetSlotCell
                            product={selectedProduct}
                            type={type}
                            assets={selectedAssets.filter((asset) => asset.type === type.value)}
                            {...slotProps}
                          />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Los enlaces y textos de referencia del Excel se conservan en la ficha del
                    producto. El contador corresponde a archivos guardados.
                  </p>
                </Card>
              </div>
            </>
          ) : (
            <StatePanel
              variant="empty"
              title="Selecciona un SKU"
              description="El producto solicitado no está disponible en el catálogo autorizado."
            />
          )}
        </>
      )}
      {canWrite && bulkOpen ? (
        <WorkspaceDrawer
          title="Carga masiva de documentos e imágenes"
          onClose={() => setBulkOpen(false)}
          busy={bulkBusy}
        >
          <BulkUploadPanel
            zipFile={zipFile}
            result={bulkResult}
            busy={bulkBusy}
            error={bulkError}
            onFile={(next) => {
              if (bulkInFlight.current) return;
              validatedZip.current = null;
              setZipFile(next);
              setBulkResult(null);
              setBulkError(null);
            }}
            onProcess={processZip}
          />
        </WorkspaceDrawer>
      ) : null}
    </>
  );
}

function ProductPhoto({
  product,
  assets,
}: {
  product: DocumentProduct;
  assets: readonly ProductAssetDto[];
}) {
  const photo = assets.find(
    (asset) => asset.type === 'FOTO' && asset.mimeType.startsWith('image/'),
  );
  return (
    <div className={styles.thumbnail} title={photo ? photo.filename : 'Sin fotografía registrada'}>
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
  );
}

function AssetSlotCell({
  product,
  type,
  assets,
  canWrite,
  uploadingSlots,
  deletingId,
  onUpload,
  onDelete,
}: {
  product: DocumentProduct;
  type: (typeof ASSET_TYPES)[number];
  assets: readonly ProductAssetDto[];
  canWrite: boolean;
  uploadingSlots: ReadonlySet<string>;
  deletingId: string | null;
  onUpload: (product: DocumentProduct, type: ProductAssetType, file: File) => Promise<void>;
  onDelete: (asset: ProductAssetDto) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const requirement = documentRequirement(product, type.value);
  const editable = canWrite && !!requirement;
  const uploading = uploadingSlots.has(`${product.id}:${type.value}`);
  const upload = (file: File | undefined) => {
    if (!file || !editable || uploading) return;
    void onUpload(product, type.value, file);
    if (inputRef.current) inputRef.current.value = '';
  };
  return (
    <td
      className={cn(
        styles.slot,
        assets.length
          ? styles.loaded
          : requirement === null
            ? styles.notApplicable
            : requirement?.required
              ? styles.required
              : styles.pending,
        dragging && styles.dragging,
      )}
      onDragOver={
        editable
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={editable ? () => setDragging(false) : undefined}
      onDrop={
        editable
          ? (event) => {
              event.preventDefault();
              setDragging(false);
              upload(event.dataTransfer.files[0]);
            }
          : undefined
      }
      title={editable ? `Arrastra aquí ${type.formats}` : undefined}
    >
      <div className={styles.slotContents}>
        <div className="min-w-0 flex-1">
          {assets.length ? (
            assets.map((asset) => (
              <div key={asset.id} className={styles.file}>
                <FileText aria-hidden="true" className="size-3 shrink-0" />
                <a
                  href={productAssetDownloadUrl(asset.id)}
                  title={asset.filename}
                  aria-label={`Descargar ${asset.filename}`}
                >
                  {asset.filename}
                </a>
                {canWrite ? (
                  <button
                    type="button"
                    disabled={deletingId === asset.id}
                    onClick={() => void onDelete(asset)}
                    aria-label={`Eliminar ${asset.filename}`}
                  >
                    <Trash2 aria-hidden="true" className="size-3" />
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <span className={styles.slotState}>{documentState(product, type.value, assets)}</span>
          )}
        </div>
        {editable ? (
          <label className={styles.upload}>
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
      <div className="mt-5 grid gap-5 ">
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
              disabled={busy}
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
