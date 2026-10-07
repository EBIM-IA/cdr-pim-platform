'use client';

import type {
  CatalogCategorySummaryDto,
  CatalogWorkbookResultDto,
  ProductStatus,
} from '@cdr/contracts';
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileUp,
  List as ListIcon,
  PackageSearch,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { CatalogWorkbookTable } from '@/components/catalog-workbook-table';
import { DynamicCatalogSheet } from '@/components/dynamic-catalog-sheet';
import { ProductArtwork } from '@/components/product-artwork';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { TableExportButtons } from '@/components/table-export-buttons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductsData } from '@/components/use-products-data';
import { fetchCatalogCategories } from '@/lib/dynamic-catalog-api';
import type { Product } from '@/lib/types';
import { cn, formatNumber, unique } from '@/lib/utils';

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

function availableCatalogValue(value: string): boolean {
  return Boolean(value && !/^no disponible/i.test(value));
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
    return <span className="text-[10px] text-muted-foreground">No medido por el backend</span>;
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

function ProductCatalogList({ products }: { products: Product[] }) {
  return (
    <ul className="space-y-3">
      {products.map((product) => (
        <li
          key={product.id}
          className="grid min-w-0 gap-5 rounded-xl border bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md md:grid-cols-[130px_minmax(0,1fr)_180px_170px] md:items-center md:p-5"
        >
          <ProductArtwork
            category={product.category}
            name={product.name}
            className="aspect-square h-auto min-h-28 rounded-lg"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/products/${encodeURIComponent(product.id)}`}
                className="break-all text-xl font-extrabold tracking-tight hover:text-primary"
              >
                {product.sku}
              </Link>
              <StatusBadge tone="info">Registro del backend</StatusBadge>
            </div>
            <p className="mt-1 text-sm font-semibold">{product.name}</p>
            {product.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {product.description}
              </p>
            ) : null}
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Marca', product.brand],
                ['Línea / categoría', product.category],
                ['Aplicación', product.application],
                ['Código unificador', product.unifiedCode ?? 'Sin código'],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[10px] text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 break-words font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-col items-start gap-3">
            <StatusBadge tone={statusTone(product.status)}>
              {statusLabel(product.status)}
            </StatusBadge>
            <CompletenessMeter value={product.completeness} sku={product.sku} />
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href={`/products/${encodeURIComponent(product.id)}`}>Ver producto</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/products/${encodeURIComponent(product.id)}?edit=enrichment`}>
                Editar enriquecimiento
              </Link>
            </Button>
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
        <Skeleton key={index} className="h-[410px] rounded-xl" />
      ))}
    </div>
  );
}

export function ProductsCatalog({
  initialSearch = '',
  initialBrand = '',
  initialStatus = '',
  canEditAttributes = false,
}: {
  initialSearch?: string;
  initialBrand?: string;
  initialStatus?: ProductStatus | '';
  canEditAttributes?: boolean;
}) {
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [brand, setBrand] = useState(initialBrand);
  const [status, setStatus] = useState<ProductStatus | ''>(initialStatus);
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState('');
  const [application, setApplication] = useState('');
  const [completeness, setCompleteness] = useState<CompletenessFilter>('');
  const [requestedPage, setRequestedPage] = useState(1);
  const [requestedPageSize, setRequestedPageSize] = useState(25);
  const [view, setView] = useState<CatalogView>('table');
  const [urlReady, setUrlReady] = useState(false);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategorySummaryDto[]>([]);
  const [workbookFacets, setWorkbookFacets] = useState<CatalogWorkbookResultDto['facets']>({
    brands: [],
    applicationTypes: [],
    statuses: [],
  });
  const updateWorkbookFacets = useCallback((facets: CatalogWorkbookResultDto['facets']) => {
    setWorkbookFacets(facets);
    setApplication((current) =>
      current && !facets.applicationTypes.includes(current) ? '' : current,
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalogCategories(controller.signal)
      .then(setCatalogCategories)
      .catch(() => setCatalogCategories([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFamily(params.get('family') ?? '');
    setCategory(params.get('category') ?? '');
    setApplication(params.get('application') ?? '');
    const completenessParam = params.get('completeness');
    if (
      completenessParam === 'complete' ||
      completenessParam === 'attention' ||
      completenessParam === 'critical' ||
      completenessParam === 'unavailable'
    ) {
      setCompleteness(completenessParam);
    }
    setUrlReady(true);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setRequestedPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setRequestedPage(1);
  }, [application, category, completeness, family]);

  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams(window.location.search);
    const update = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };

    update('q', debouncedSearch);
    update('brand', brand);
    update('status', status);
    update('family', family);
    update('category', category);
    update('application', application);
    update('completeness', completeness);

    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      query ? `/products?${query}` : '/products',
    );
  }, [application, brand, category, completeness, debouncedSearch, family, status, urlReady]);

  const { products, total, page, pageSize, totalPages, loading, error, reload } = useProductsData({
    q: debouncedSearch || undefined,
    brand: brand || undefined,
    status: status || undefined,
    page: requestedPage,
    pageSize: requestedPageSize,
  });

  const brands = useMemo(
    () =>
      unique([
        ...products.map((product) => product.brandFilter),
        ...workbookFacets.brands,
        brand || undefined,
      ]).sort(),
    [brand, products, workbookFacets.brands],
  );
  const statuses = useMemo<ProductStatus[]>(
    () =>
      Array.from(
        new Set([
          ...products.map((product) => product.status),
          ...workbookFacets.statuses,
          ...(status ? [status] : []),
        ]),
      ).sort(),
    [products, status, workbookFacets.statuses],
  );
  const catalogApplications = useMemo(
    () =>
      unique(products.map((product) => product.application).filter(availableCatalogValue)).sort(),
    [products],
  );
  const applicationOptions =
    view === 'table' ? workbookFacets.applicationTypes : catalogApplications;
  const hasCompletenessData = products.some((product) => product.completeness !== null);
  const activeFilterCount = [brand, status, family, category, application, completeness].filter(
    Boolean,
  ).length;
  const hasCriteria = Boolean(searchInput.trim() || debouncedSearch || activeFilterCount);
  const firstVisible = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, total);
  const searchPending = searchInput.trim() !== debouncedSearch;
  const familyCounts = useMemo(
    () =>
      catalogFamilies.map((item) => ({
        name: item.name,
        count: products.filter((product) => catalogFamily(product) === item.name).length,
      })),
    [products],
  );
  const visibleProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          (!family || catalogFamily(product) === family) &&
          (!category || product.category === category) &&
          (!application || product.application === application) &&
          matchesCompleteness(product.completeness, completeness),
      ),
    [application, category, completeness, family, products],
  );
  const hasClientFilters = Boolean(family || category || application || completeness);
  const visibleTotal = hasClientFilters ? visibleProducts.length : total;
  const visibleFirst = visibleTotal > 0 ? (hasClientFilters ? 1 : firstVisible) : 0;
  const visibleLast = hasClientFilters ? visibleProducts.length : lastVisible;
  const exportRows = useMemo(
    () =>
      visibleProducts.map((product) => [
        product.sku,
        product.name,
        product.brand,
        product.category,
        product.application,
        statusLabel(product.status),
        product.completeness,
        product.providerCode,
        product.unifiedCode,
      ]),
    [visibleProducts],
  );

  const changeBrand = (value: string) => {
    setBrand(value);
    setRequestedPage(1);
  };
  const changeStatus = (value: ProductStatus | '') => {
    setStatus(value);
    setRequestedPage(1);
  };
  const clearSearch = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setRequestedPage(1);
  };
  const clearFilters = () => {
    clearSearch();
    setBrand('');
    setStatus('');
    setFamily('');
    setCategory('');
    setApplication('');
    setCompleteness('');
  };

  return (
    <>
      <nav
        aria-label="Ruta del catálogo"
        className="mb-4 flex items-center gap-2 text-[11px] text-muted-foreground"
      >
        <Link href="/" className="hover:text-primary">
          Inicio
        </Link>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={clearFilters} className="hover:text-primary">
          Catálogo maestro
        </button>
        {family ? (
          <>
            <span aria-hidden="true">/</span>
            <strong className="text-foreground">{family}</strong>
          </>
        ) : null}
      </nav>
      <PageHeader
        title="Catálogo maestro de productos"
        description={`${formatNumber(total || products.length)} SKU disponibles en el catálogo conectado. Los filtros sin contrato persistente se muestran bloqueados, no simulados.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/quality?view=search">
                <Search aria-hidden="true" className="size-4" />
                Búsqueda inteligente
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/imports">
                <FileUp aria-hidden="true" className="size-4" />
                Importaciones
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setView('sheet')}
              aria-pressed={view === 'sheet'}
            >
              <Columns3 aria-hidden="true" className="size-4" />
              Actualización masiva
            </Button>
            {view === 'catalog' ? (
              <TableExportButtons
                filename="catalogo-pim-filtrado"
                sheetName="Productos"
                headers={[
                  'SKU',
                  'Descripción',
                  'Marca',
                  'Línea / categoría',
                  'Aplicación',
                  'Estado',
                  'Completitud (%)',
                  'Código proveedor',
                  'Código unificador',
                ]}
                rows={exportRows}
                disabled={loading}
              />
            ) : null}
          </>
        }
      />

      <ScreenGuide
        objective="Catálogo maestro: reúne los SKU recibidos desde ERP para buscarlos, filtrarlos y abrirlos. El PIM no crea SKU; los enriquece."
        actions={[
          'Busca por SKU, descripción o marca y combina la consulta con los filtros disponibles.',
          'La vista Tabla reúne la unión real de atributos visibles; usa los encabezados para filtrar y ordenar.',
          'Haz clic en una celda editable y pulsa Enter; «-» vacía un atributo opcional y un blanco no modifica nada.',
        ]}
        dataSource="Los productos, plantillas, columnas, permisos y valores provienen de la API del catálogo. Las búsquedas, filtros y ediciones se ejecutan en el backend."
        limitation="La tabla se pagina en el backend; filtros de encabezado y exportación operan sobre las filas visibles de la página. Los valores ERP permanecen de solo lectura."
      />

      {view === 'catalog' ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Familias de producto">
          <button
            type="button"
            onClick={() => setFamily('')}
            aria-pressed={!family}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold',
              !family
                ? 'border-primary bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-white hover:border-orange-200',
            )}
          >
            Todas{' '}
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">
              {products.length}
            </span>
          </button>
          {familyCounts.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setFamily(item.name)}
              aria-pressed={family === item.name}
              className={cn(
                'inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold',
                family === item.name
                  ? 'border-primary bg-orange-50 text-orange-700'
                  : 'border-slate-200 bg-white hover:border-orange-200',
              )}
            >
              {item.name}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">
                {item.count}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {view === 'sheet' ? (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div>
            <p className="text-sm font-semibold">Actualización masiva por plantilla</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Las columnas, permisos y cambios provienen del backend del catálogo dinámico.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setView('catalog')}>
            Volver al catálogo
          </Button>
        </Card>
      ) : (
        <Card className="mb-5 overflow-hidden">
          <div
            id="catalog-filters"
            className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-[minmax(260px,1.6fr)_repeat(6,minmax(130px,1fr))_auto] 2xl:items-end"
          >
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground sm:col-span-2 xl:col-span-2 2xl:col-span-1">
              <span>Buscar</span>
              <span className="relative block">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
                />
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="SKU, marca, categoría o cualquier atributo: 2RS, caucho, C3, FMSI…"
                  className="pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
                  aria-describedby="catalog-search-status"
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </span>
              <span id="catalog-search-status" className="sr-only" aria-live="polite">
                {searchPending
                  ? 'Preparando búsqueda'
                  : loading
                    ? 'Buscando productos'
                    : 'Búsqueda actualizada'}
              </span>
            </label>

            <Select
              label="Línea / categoría"
              value={category}
              disabled={view === 'catalog' || catalogCategories.length === 0}
              title={
                view === 'catalog'
                  ? 'La categoría se aplica a la tabla dinámica.'
                  : catalogCategories.length === 0
                    ? 'No hay categorías visibles para tu rol.'
                    : undefined
              }
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Todas las categorías</option>
              {catalogCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select
              label="Marca"
              value={brand}
              onChange={(event) => changeBrand(event.target.value)}
            >
              <option value="">Todas las marcas</option>
              {brands.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              label="Aplicación"
              value={application}
              disabled={applicationOptions.length === 0}
              title={
                applicationOptions.length === 0
                  ? 'No hay aplicaciones activas para el alcance seleccionado.'
                  : undefined
              }
              onChange={(event) => setApplication(event.target.value)}
            >
              <option value="">
                {applicationOptions.length === 0
                  ? 'Sin aplicaciones activas'
                  : 'Todas las aplicaciones'}
              </option>
              {applicationOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              label="Estado"
              value={status}
              onChange={(event) => changeStatus(event.target.value as ProductStatus | '')}
            >
              <option value="">Todos los estados</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {statusLabel(item)}
                </option>
              ))}
            </Select>
            <Select
              label="Completitud"
              value={completeness}
              disabled={view === 'catalog' && !hasCompletenessData}
              title={
                view === 'table' || hasCompletenessData
                  ? undefined
                  : 'El backend todavía no publica completitud en el listado general.'
              }
              onChange={(event) => setCompleteness(event.target.value as CompletenessFilter)}
            >
              <option value="">
                {view === 'table' || hasCompletenessData ? 'Todas' : 'Indicador no disponible'}
              </option>
              <option value="complete">90–100%</option>
              <option value="attention">70–89%</option>
              <option value="critical">Menos de 70%</option>
              {view === 'catalog' ? <option value="unavailable">Sin indicador</option> : null}
            </Select>
            <Select
              label="Origen del dato"
              value=""
              disabled
              title="Cada atributo conserva su propia fuente; falta acordar una regla única de origen por SKU."
            >
              <option value="">Pendiente de regla por SKU</option>
            </Select>
            <div className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              <span>Vista</span>
              <div
                className="flex rounded-lg border bg-slate-50 p-1"
                role="group"
                aria-label="Vista del listado"
              >
                <Button
                  variant={view === 'catalog' ? 'dark' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setCategory('');
                    setApplication('');
                    setCompleteness('');
                    setView('catalog');
                  }}
                  aria-pressed={view === 'catalog'}
                >
                  <PackageSearch aria-hidden="true" className="size-4" /> Catálogo
                </Button>
                <Button
                  variant={view === 'table' ? 'dark' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setFamily('');
                    setApplication('');
                    setCompleteness('');
                    setView('table');
                  }}
                  aria-pressed={view === 'table'}
                >
                  <ListIcon aria-hidden="true" className="size-4" /> Tabla
                </Button>
              </div>
            </div>
          </div>

          <p className="border-t bg-slate-50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
            En Tabla, búsqueda, categoría, marca y estado se procesan en el backend; la búsqueda
            también recorre valores de atributos visibles. Aplicación y completitud pertenecen a la
            vista Catálogo cuando esos indicadores están disponibles.
          </p>

          {searchInput || activeFilterCount ? (
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">Filtros activos</span>
              {searchInput ? (
                <button type="button" className={activeChipClass} onClick={clearSearch}>
                  “{searchInput}” <X aria-hidden="true" className="size-3" />
                </button>
              ) : null}
              {family ? (
                <button type="button" className={activeChipClass} onClick={() => setFamily('')}>
                  {family} <X aria-hidden="true" className="size-3" />
                </button>
              ) : null}
              {category ? (
                <button type="button" className={activeChipClass} onClick={() => setCategory('')}>
                  {catalogCategories.find((item) => item.id === category)?.name ?? category}{' '}
                  <X aria-hidden="true" className="size-3" />
                </button>
              ) : null}
              {brand ? (
                <button type="button" className={activeChipClass} onClick={() => changeBrand('')}>
                  {brand} <X aria-hidden="true" className="size-3" />
                </button>
              ) : null}
              {application ? (
                <button
                  type="button"
                  className={activeChipClass}
                  onClick={() => setApplication('')}
                >
                  {application} <X aria-hidden="true" className="size-3" />
                </button>
              ) : null}
              {status ? (
                <button type="button" className={activeChipClass} onClick={() => changeStatus('')}>
                  {statusLabel(status)} <X aria-hidden="true" className="size-3" />
                </button>
              ) : null}
              {completeness ? (
                <button
                  type="button"
                  className={activeChipClass}
                  onClick={() => setCompleteness('')}
                >
                  {completenessLabel(completeness)} <X aria-hidden="true" className="size-3" />
                </button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar todo
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      {view === 'sheet' ? <DynamicCatalogSheet /> : null}
      {view === 'table' ? (
        <CatalogWorkbookTable
          q={debouncedSearch || undefined}
          brand={brand || undefined}
          status={status || undefined}
          categoryId={category || undefined}
          applicationType={
            application === 'AUTOMOTRIZ' || application === 'INDUSTRIAL' ? application : undefined
          }
          completeness={
            completeness === 'complete' ||
            completeness === 'attention' ||
            completeness === 'critical'
              ? completeness
              : undefined
          }
          canEdit={canEditAttributes}
          onFacetsChange={updateWorkbookFacets}
        />
      ) : null}
      {view === 'catalog' && loading ? <CatalogSkeleton count={requestedPageSize} /> : null}
      {view === 'catalog' && !loading && error ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar los productos"
          description={error}
          actionLabel="Reintentar"
          onAction={reload}
        />
      ) : null}
      {view === 'catalog' && !loading && !error && visibleProducts.length === 0 ? (
        <StatePanel
          variant="empty"
          title={
            hasCriteria ? 'Sin resultados para estos criterios' : 'No hay productos disponibles'
          }
          description={
            hasCriteria
              ? 'Ajusta la búsqueda o elimina uno de los filtros. No se modificó ningún dato del catálogo.'
              : 'La API respondió correctamente, pero todavía no contiene registros de producto.'
          }
          actionLabel={hasCriteria ? 'Limpiar criterios' : undefined}
          onAction={hasCriteria ? clearFilters : undefined}
        />
      ) : null}

      {view === 'catalog' && !loading && !error && visibleProducts.length > 0 ? (
        <>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold" aria-live="polite">
              Mostrando {formatNumber(visibleFirst)}–{formatNumber(visibleLast)}
              {' de '}
              {formatNumber(visibleTotal)} productos
            </p>
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </p>
          </div>

          <ProductCatalogList products={visibleProducts} />

          <nav
            className="mt-6 flex flex-col gap-4 rounded-xl border bg-slate-50 p-4 sm:flex-row sm:items-end sm:justify-between"
            aria-label="Paginación del catálogo"
          >
            <div className="w-full sm:w-44">
              <Select
                label="Resultados por página"
                value={requestedPageSize}
                onChange={(event) => {
                  setRequestedPageSize(Number(event.target.value));
                  setRequestedPage(1);
                }}
              >
                <option value={25}>25 productos</option>
                <option value={50}>50 productos</option>
                <option value={100}>100 productos</option>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setRequestedPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                aria-label={`Ir a la página ${Math.max(1, page - 1)}`}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
                Anterior
              </Button>
              <span className="min-w-20 text-center text-sm font-semibold tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setRequestedPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                aria-label={`Ir a la página ${Math.min(totalPages, page + 1)}`}
              >
                Siguiente
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}
