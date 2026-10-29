'use client';

import type {
  CatalogCategorySummaryDto,
  CatalogWorkbookResultDto,
  CatalogWorkbookProductDto,
  CatalogWorkbookColumnDto,
  ProductStatus,
  ProductAssetDto,
} from '@cdr/contracts';
import { ChevronLeft, ChevronRight, Columns3, Search, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CatalogSearch } from '@/components/catalog-search';
import { PageHeader } from '@/components/page-header';
import { CatalogWorkbookTable } from '@/components/catalog-workbook-table';
import { DynamicCatalogSheet } from '@/components/dynamic-catalog-sheet';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { TableExportButtons } from '@/components/table-export-buttons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CategoryTreeSelect,
  type CategoryTreeSelectOption,
} from '@/components/ui/category-tree-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchCatalogCategories, fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { listProductAssetsBatch } from '@/lib/product-assets-api';
import type { Product } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';

type CatalogView = 'catalog' | 'table' | 'sheet';
type CompletenessFilter = '' | 'complete' | 'attention' | 'critical' | 'unavailable';

const catalogFamilies = [
  { name: 'Rodamientos', patterns: ['rodamiento', 'cojinete'] },
  { name: 'Retenes y sellos', patterns: ['reten', 'sello'] },
  { name: 'Frenos', patterns: ['freno', 'pastilla', 'disco'] },
  { name: 'Transmisión', patterns: ['transmision', 'cardan', 'cruceta'] },
  { name: 'Lubricantes y fluidos', patterns: ['aceite', 'grasa', 'lubric', 'fluido'] },
  { name: 'Fijación', patterns: ['perno', 'tuerca', 'arandela', 'fijacion'] },
] as const;

const activeChipClass =
  'inline-flex min-h-7 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 text-[11px] font-semibold text-orange-800 hover:border-primary';

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();
}

export function catalogFamily(product: Product): string {
  const haystack = normalized(`${product.name} ${product.description ?? ''}`);
  return (
    catalogFamilies.find((family) => family.patterns.some((pattern) => haystack.includes(pattern)))
      ?.name ?? 'Otros'
  );
}

export function matchesCompleteness(
  completeness: number | null,
  filter: CompletenessFilter,
): boolean {
  if (!filter) return true;
  if (filter === 'unavailable') return completeness === null;
  if (completeness === null) return false;
  if (filter === 'complete') return completeness >= 90;
  if (filter === 'attention') return completeness >= 70 && completeness < 90;
  return completeness < 70;
}

function completenessLabel(filter: CompletenessFilter): string {
  return {
    '': 'Todas',
    complete: '90–100% · completa',
    attention: '70–89% · por completar',
    critical: 'Menos de 70% · crítica',
    unavailable: 'Sin indicador disponible',
  }[filter];
}

function CompletenessMeter({ value, sku }: { value: number | null; sku: string }) {
  if (value === null) {
    return <span className="text-[10px] text-muted-foreground">Sin indicador de completitud</span>;
  }
  const tone = value >= 90 ? 'bg-emerald-500' : value >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="min-w-28" aria-label={`Completitud de ${sku}: ${value}%`}>
      <span className="text-[11px] font-semibold">{value}% completo</span>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200">
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

function ProductCatalogList({
  products,
  assets,
  showStatus,
  showCompleteness,
  canEdit,
}: {
  products: Product[];
  assets: Record<string, ProductAssetDto[]>;
  showStatus: boolean;
  showCompleteness: boolean;
  canEdit: boolean;
}) {
  return (
    <ul className="space-y-2">
      {products.map((product) => (
        <li
          key={product.id}
          className={cn(
            'grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-xl border bg-white p-2 shadow-sm transition hover:border-orange-200 hover:shadow-md md:items-center md:pr-3',
            showStatus || showCompleteness
              ? 'md:grid-cols-[56px_minmax(0,1fr)_150px_auto]'
              : 'md:grid-cols-[56px_minmax(0,1fr)_auto]',
          )}
        >
          <ProductThumbnail product={product} assets={assets[product.id]} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/products/${encodeURIComponent(product.id)}`}
                title={`Ver ficha técnica de ${product.sku}`}
                className="break-all text-base font-extrabold tracking-tight hover:text-primary"
              >
                {product.sku}
              </Link>
              {product.classificationPending ? (
                <StatusBadge tone="warning">Pendiente de clasificación</StatusBadge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[13px] font-normal leading-4">
              {product.name === product.sku
                ? (product.templateKey ?? product.category)
                : product.name}
            </p>
            {product.description ? (
              <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-muted-foreground">
                {product.description}
              </p>
            ) : null}
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {[
                ['Marca', product.brand],
                ['Categoría', product.category],
                ['Aplicación', product.application],
                ['Código unificador', product.unifiedCode ?? 'Sin código'],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-baseline gap-1">
                  <dt className="text-[10px] text-muted-foreground">{label}</dt>
                  <dd className="break-words text-[11px] font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {showStatus || showCompleteness ? (
            <div className="col-span-2 flex flex-wrap items-center gap-3 md:col-span-1 md:flex-col md:items-start">
              {showStatus ? (
                <StatusBadge tone={statusTone(product.status)}>
                  {statusLabel(product.status)}
                </StatusBadge>
              ) : null}
              {showCompleteness ? (
                <CompletenessMeter value={product.completeness} sku={product.sku} />
              ) : null}
            </div>
          ) : null}
          <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
            <Button asChild size="sm">
              <Link href={`/products/${encodeURIComponent(product.id)}`}>Ver producto</Link>
            </Button>
            {canEdit && !product.classificationPending ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/products/${encodeURIComponent(product.id)}?edit=enrichment`}>
                  Editar enriquecimiento
                </Link>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CatalogSkeleton({ count }: { count: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Cargando productos"
    >
      <span className="sr-only" role="status">
        Cargando productos…
      </span>
      {Array.from({ length: Math.min(count, 6) }, (_, index) => (
        <Skeleton key={index} className="h-[260px] rounded-xl" />
      ))}
    </div>
  );
}

export function workbookCatalogProduct(
  row: CatalogWorkbookProductDto,
  columns: readonly CatalogWorkbookColumnDto[],
): Product {
  const labels = new Map(columns.map((column) => [column.key, column]));
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description ?? undefined,
    brand: row.brand ?? 'Sin marca',
    brandFilter: row.brand ?? undefined,
    category: row.category?.name ?? 'Pendiente de clasificación',
    application:
      row.applicationTypes
        .map((type) =>
          type === 'AUTOMOTRIZ' ? 'Automotriz' : type === 'INDUSTRIAL' ? 'Industrial' : type,
        )
        .join(' e ') || 'Sin aplicación',
    status: row.status as ProductStatus,
    completeness: row.completeness,
    unifiedCode: row.unifiedCode ?? undefined,
    providerCode: row.providerCode ?? undefined,
    templateKey: row.template?.name,
    classificationPending: !row.template,
    updatedAt: row.updatedAt,
    attributes: Object.entries(row.attributes).flatMap(([key, cell]) => {
      if (!row.template || !cell.applicable) return [];
      const column = labels.get(key);
      return [
        {
          key,
          label: column?.label ?? key,
          value: cell.value === null ? 'Pendiente' : String(cell.value),
          rawValue: cell.value ?? '',
          unit: column?.unit ?? undefined,
          required: cell.required,
        },
      ];
    }),
  };
}

export function catalogFilterCategories(
  categories: readonly CatalogCategorySummaryDto[],
): CategoryTreeSelectOption[] {
  const options = new Map<string, CategoryTreeSelectOption>();
  for (const category of categories) {
    for (const ancestor of category.ancestors ?? []) {
      options.set(ancestor.id, {
        value: ancestor.id,
        label: ancestor.name,
        path: ancestor.path,
        keywords: [ancestor.slug],
      });
    }
    options.set(category.id, {
      value: category.id,
      label: category.name,
      path: category.path,
      keywords: [category.slug, category.templateName, category.templateVariantKey],
    });
  }
  return [...options.values()];
}

export function ProductsCatalog({
  initialSearch = '',
  initialBrand = '',
  initialStatus = '',
  canEditAttributes = false,
  canViewQuality = false,
  canViewImports = false,
  showCompleteness = false,
  showProductStatus = true,
  showTableDescriptionAndTemplate = true,
}: {
  initialSearch?: string;
  initialBrand?: string;
  initialStatus?: ProductStatus | '';
  canEditAttributes?: boolean;
  canViewQuality?: boolean;
  canViewImports?: boolean;
  showCompleteness?: boolean;
  showProductStatus?: boolean;
  showTableDescriptionAndTemplate?: boolean;
}) {
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [brand, setBrand] = useState(initialBrand);
  const [status, setStatus] = useState<ProductStatus | ''>(showProductStatus ? initialStatus : '');
  const [category, setCategory] = useState('');
  const [application, setApplication] = useState('');
  const [completeness, setCompleteness] = useState<CompletenessFilter>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [view, setView] = useState<CatalogView>('catalog');
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(
    Boolean(initialBrand || initialStatus),
  );
  const [urlReady, setUrlReady] = useState(false);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategorySummaryDto[]>([]);
  const [facets, setFacets] = useState<CatalogWorkbookResultDto['facets']>({
    brands: [],
    applicationTypes: [],
    statuses: [],
  });
  const [result, setResult] = useState<CatalogWorkbookResultDto | null>(null);
  const [productAssets, setProductAssets] = useState<Record<string, ProductAssetDto[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const updateFacets = useCallback(
    (next: CatalogWorkbookResultDto['facets']) => setFacets(next),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalogCategories(controller.signal)
      .then((categories) => {
        if (!controller.signal.aborted) setCatalogCategories(categories);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogCategories([]);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const categoryValue = params.get('category') ?? '';
    const applicationValue = params.get('application') ?? '';
    const completenessValue = params.get('completeness');
    setCategory(categoryValue);
    setApplication(applicationValue);
    if (params.get('view') === 'table') setView('table');
    if (
      showCompleteness &&
      (completenessValue === 'complete' ||
        completenessValue === 'attention' ||
        completenessValue === 'critical')
    )
      setCompleteness(completenessValue);
    if (categoryValue || applicationValue || (showCompleteness && completenessValue))
      setAdvancedFiltersOpen(true);
    setUrlReady(true);
  }, [showCompleteness]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams(window.location.search);
    const update = (key: string, value: string) =>
      value ? params.set(key, value) : params.delete(key);
    update('q', debouncedSearch);
    update('brand', brand);
    update('status', showProductStatus ? status : '');
    update('category', category);
    update('application', application);
    update('completeness', showCompleteness ? completeness : '');
    update('view', view === 'table' ? 'table' : '');
    params.delete('family');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      query ? `/products?${query}` : '/products',
    );
  }, [
    application,
    brand,
    category,
    completeness,
    debouncedSearch,
    showCompleteness,
    showProductStatus,
    status,
    urlReady,
    view,
  ]);

  useEffect(() => {
    if (!urlReady || view !== 'catalog') return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchCatalogWorkbook(
      {
        filter: [],
        q: debouncedSearch || undefined,
        brand: brand || undefined,
        status: showProductStatus ? status || undefined : undefined,
        categoryId: category || undefined,
        applicationType:
          application === 'AUTOMOTRIZ' || application === 'INDUSTRIAL' ? application : undefined,
        completeness:
          showCompleteness &&
          (completeness === 'complete' ||
            completeness === 'attention' ||
            completeness === 'critical')
            ? completeness
            : undefined,
        page,
        pageSize,
      },
      controller.signal,
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        setResult(next);
        setFacets(next.facets);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible consultar el catálogo.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    application,
    brand,
    category,
    completeness,
    debouncedSearch,
    page,
    pageSize,
    revision,
    showCompleteness,
    showProductStatus,
    urlReady,
    view,
  ]);

  const products = useMemo(
    () => result?.items.map((row) => workbookCatalogProduct(row, result.columns)) ?? [],
    [result],
  );
  useEffect(() => {
    if (view !== 'catalog' || !products.length) return;
    const controller = new AbortController();
    setProductAssets({});
    void listProductAssetsBatch(
      products.map((product) => product.id),
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted)
          setProductAssets(Object.fromEntries(rows.map((row) => [row.productId, row.assets])));
      })
      .catch(() => {
        /* The catalog remains usable with its technical drawings. */
      });
    return () => controller.abort();
  }, [products, revision, view]);
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const categoryOptions = useMemo(
    () => catalogFilterCategories(catalogCategories),
    [catalogCategories],
  );
  const selectedCategory = categoryOptions.find((item) => item.value === category);
  const activeFilterCount = [
    brand,
    showProductStatus ? status : '',
    category,
    application,
    showCompleteness ? completeness : '',
  ].filter(Boolean).length;
  const clearSearch = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
  };
  const clearFilters = () => {
    clearSearch();
    setBrand('');
    setStatus('');
    setCategory('');
    setApplication('');
    setCompleteness('');
  };
  const exportHeaders = [
    'SKU',
    ...(showTableDescriptionAndTemplate ? ['Descripción'] : []),
    'Marca',
    'Categoría',
    'Aplicación',
    ...(showProductStatus ? ['Estado'] : []),
    ...(showCompleteness ? ['Completitud (%)'] : []),
    'Código proveedor',
    'Código unificador',
  ];
  const exportRows = products.map((product) => [
    product.sku,
    ...(showTableDescriptionAndTemplate ? [product.name] : []),
    product.brand,
    product.category,
    product.application,
    ...(showProductStatus ? [statusLabel(product.status)] : []),
    ...(showCompleteness ? [product.completeness] : []),
    product.providerCode,
    product.unifiedCode,
  ]);
  const filterChip = (value: string, label: string, clear: () => void) =>
    value ? (
      <button
        type="button"
        className={activeChipClass}
        onClick={clear}
        aria-label={`Quitar filtro ${label}`}
      >
        {label}
        <X aria-hidden="true" className="size-3" />
      </button>
    ) : null;

  return (
    <>
      <PageHeader
        title="Catálogo maestro de productos"
        description={
          view === 'catalog' && result
            ? `${formatNumber(total)} SKU · sincronizados desde ERP (Sismetic / AX)`
            : 'Productos sincronizados desde ERP (Sismetic / AX)'
        }
        actions={
          <>
            <div
              className="flex rounded-lg border bg-white p-0.5"
              role="group"
              aria-label="Vista del listado"
            >
              {(
                [
                  ['catalog', 'Catálogo'],
                  ['table', 'Tabla'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={view === value ? 'outline' : 'ghost'}
                  size="sm"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {view === 'table' ? (
              <CategoryTreeSelect
                label="Filtrar la tabla por categoría"
                value={category}
                placeholder="Todas las categorías"
                options={categoryOptions}
                disabled={catalogCategories.length === 0}
                onValueChange={(value) => {
                  setCategory(value);
                  setPage(1);
                }}
                className="w-64 max-w-full"
              />
            ) : null}
            {canViewImports ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/imports">Importaciones</Link>
              </Button>
            ) : null}
            {canEditAttributes ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setView('sheet')}
                aria-pressed={view === 'sheet'}
              >
                <Columns3 aria-hidden="true" className="size-4" />
                Actualización masiva
              </Button>
            ) : null}
            {view === 'catalog' ? (
              <TableExportButtons
                filename="catalogo-pim-filtrado"
                sheetName="Productos"
                headers={exportHeaders}
                rows={exportRows}
                disabled={loading}
              />
            ) : null}
          </>
        }
      />
      <ScreenGuide
        objective="Catálogo maestro: busca los SKU recibidos desde ERP, consulta sus especificaciones y completa sus atributos."
        actions={[
          'Busca por SKU, descripción, marca o atributos y combina filtros.',
          'La vista Tabla permite ordenar, filtrar por columna y editar los atributos autorizados.',
          'El SKU y los datos ERP son de solo lectura; los atributos dependen de la plantilla activa.',
        ]}
        dataSource="Catálogo ERP y atributos de las plantillas activas."
      />
      {view === 'sheet' ? (
        <>
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-semibold">Actualización masiva por plantilla</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecciona una plantilla para actualizar los atributos permitidos de sus productos.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setView('catalog')}>
              Volver al catálogo
            </Button>
          </Card>
          <DynamicCatalogSheet />
        </>
      ) : (
        <>
          <Card className="mb-3 overflow-visible">
            <div className="flex flex-wrap items-center gap-2 p-2.5">
              <CatalogSearch
                value={searchInput}
                onChange={setSearchInput}
                showDescription={showTableDescriptionAndTemplate}
                onSearch={(query, filter) => {
                  setSearchInput(query);
                  setDebouncedSearch(query.trim());
                  if (filter?.categoryId) setCategory(filter.categoryId);
                  if (filter?.brand) setBrand(filter.brand);
                  setPage(1);
                }}
              />
              {canViewQuality ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href="/quality?view=search">
                    <Search aria-hidden="true" className="size-3.5" />
                    Búsqueda inteligente
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={advancedFiltersOpen}
                aria-controls="catalog-advanced-filters"
                onClick={() => setAdvancedFiltersOpen((current) => !current)}
              >
                <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                Filtros
                <span
                  aria-label={`${activeFilterCount} filtros activos`}
                  className={cn(
                    'rounded-full px-1 text-[10px]',
                    activeFilterCount > 0 && 'bg-primary text-white',
                  )}
                >
                  {activeFilterCount || ''}
                </span>
              </Button>
            </div>
            {advancedFiltersOpen ? (
              <div
                id="catalog-advanced-filters"
                className="grid gap-3 border-t bg-white p-3 sm:grid-cols-2 xl:grid-cols-5"
              >
                {view !== 'table' ? (
                  <CategoryTreeSelect
                    label="Línea / categoría"
                    value={category}
                    placeholder="Todas las categorías"
                    options={categoryOptions}
                    disabled={catalogCategories.length === 0}
                    onValueChange={(value) => {
                      setCategory(value);
                      setPage(1);
                    }}
                  />
                ) : null}
                <SearchableSelect
                  label="Marca"
                  value={brand}
                  placeholder="Todas las marcas"
                  options={Array.from(new Set([...facets.brands, ...(brand ? [brand] : [])])).map(
                    (item) => ({ value: item, label: item }),
                  )}
                  onValueChange={(value) => {
                    setBrand(value);
                    setPage(1);
                  }}
                />
                <SearchableSelect
                  label="Aplicación"
                  value={application}
                  placeholder="Todas las aplicaciones"
                  options={facets.applicationTypes.map((item) => ({
                    value: item,
                    label:
                      item === 'AUTOMOTRIZ'
                        ? 'Automotriz'
                        : item === 'INDUSTRIAL'
                          ? 'Industrial'
                          : item,
                  }))}
                  onValueChange={(value) => {
                    setApplication(value);
                    setPage(1);
                  }}
                />
                {showProductStatus ? (
                  <SearchableSelect
                    label="Estado"
                    value={status}
                    placeholder="Todos los estados"
                    options={Array.from(
                      new Set([...facets.statuses, ...(status ? [status] : [])]),
                    ).map((item) => ({ value: item, label: statusLabel(item) }))}
                    onValueChange={(value) => {
                      setStatus(value as ProductStatus | '');
                      setPage(1);
                    }}
                  />
                ) : null}
                {showCompleteness ? (
                  <SearchableSelect
                    label="Completitud"
                    value={completeness}
                    placeholder="Todas"
                    options={[
                      { value: 'complete', label: '90–100%' },
                      { value: 'attention', label: '70–89%' },
                      { value: 'critical', label: 'Menos de 70%' },
                    ]}
                    onValueChange={(value) => {
                      setCompleteness(value as CompletenessFilter);
                      setPage(1);
                    }}
                  />
                ) : null}
              </div>
            ) : null}
            {searchInput || activeFilterCount ? (
              <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                <span className="text-[11px] text-muted-foreground">Filtros activos</span>
                {filterChip(searchInput, `“${searchInput}”`, clearSearch)}
                {filterChip(category, selectedCategory?.label ?? category, () => {
                  setCategory('');
                  setPage(1);
                })}
                {filterChip(brand, brand, () => {
                  setBrand('');
                  setPage(1);
                })}
                {filterChip(
                  application,
                  application === 'AUTOMOTRIZ'
                    ? 'Automotriz'
                    : application === 'INDUSTRIAL'
                      ? 'Industrial'
                      : application,
                  () => {
                    setApplication('');
                    setPage(1);
                  },
                )}
                {showProductStatus
                  ? filterChip(status, status ? statusLabel(status) : '', () => {
                      setStatus('');
                      setPage(1);
                    })
                  : null}
                {showCompleteness
                  ? filterChip(completeness, completenessLabel(completeness), () => {
                      setCompleteness('');
                      setPage(1);
                    })
                  : null}
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  Limpiar todo
                </Button>
              </div>
            ) : null}
          </Card>
          {view === 'table' ? (
            <CatalogWorkbookTable
              q={debouncedSearch || undefined}
              brand={brand || undefined}
              status={showProductStatus ? status || undefined : undefined}
              categoryId={category || undefined}
              applicationType={
                application === 'AUTOMOTRIZ' || application === 'INDUSTRIAL'
                  ? application
                  : undefined
              }
              completeness={
                showCompleteness &&
                (completeness === 'complete' ||
                  completeness === 'attention' ||
                  completeness === 'critical')
                  ? completeness
                  : undefined
              }
              canEdit={canEditAttributes}
              showCompleteness={showCompleteness}
              showStatus={showProductStatus}
              showDescriptionAndTemplate={showTableDescriptionAndTemplate}
              onFacetsChange={updateFacets}
            />
          ) : null}
          {view === 'catalog' ? (
            <>
              {loading ? (
                <CatalogSkeleton count={pageSize} />
              ) : error ? (
                <StatePanel
                  variant="error"
                  title="No pudimos cargar los productos"
                  description={error}
                  actionLabel="Reintentar"
                  onAction={() => setRevision((value) => value + 1)}
                />
              ) : products.length === 0 ? (
                <StatePanel
                  variant="empty"
                  title={
                    searchInput || activeFilterCount
                      ? 'Sin resultados para estos criterios'
                      : 'No hay productos disponibles'
                  }
                  description="Ajusta los filtros o la búsqueda para consultar otros productos."
                  actionLabel={searchInput || activeFilterCount ? 'Limpiar criterios' : undefined}
                  onAction={searchInput || activeFilterCount ? clearFilters : undefined}
                />
              ) : (
                <ProductCatalogList
                  assets={productAssets}
                  products={products}
                  showStatus={showProductStatus}
                  showCompleteness={showCompleteness}
                  canEdit={canEditAttributes}
                />
              )}
              {!loading && !error ? (
                <nav
                  className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2"
                  aria-label="Paginación del catálogo"
                >
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {formatNumber(total)} productos · página {page} de {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select
                      label="Resultados por página"
                      aria-label="Resultados por página"
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        setPage(1);
                      }}
                    >
                      <option value={25}>25 productos</option>
                      <option value={50}>50 productos</option>
                      <option value={100}>100 productos</option>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      aria-label="Página anterior"
                    >
                      <ChevronLeft aria-hidden="true" className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((value) => value + 1)}
                      aria-label="Página siguiente"
                    >
                      <ChevronRight aria-hidden="true" className="size-3.5" />
                    </Button>
                  </div>
                </nav>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </>
  );
}
