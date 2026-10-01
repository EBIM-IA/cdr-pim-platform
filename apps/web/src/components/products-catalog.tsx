'use client';

import type { ProductStatus } from '@cdr/contracts';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ProductArtwork } from '@/components/product-artwork';
import { ProductCard } from '@/components/product-card';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductsData } from '@/components/use-products-data';
import type { Product } from '@/lib/types';
import { cn, formatNumber, unique } from '@/lib/utils';

type CatalogView = 'cards' | 'table';

function ProductTable({ products }: { products: Product[] }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="scrollbar-thin max-w-full overflow-x-auto">
        <table className="w-full min-w-[940px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Productos del catálogo con identidad, línea, calidad y estado
          </caption>
          <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                <span className="sr-only">Representación</span>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Producto
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Marca
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Línea
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Aplicación
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Completitud
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((product) => (
              <tr key={product.id} className="transition-colors hover:bg-orange-50/45">
                <td className="px-4 py-3">
                  <ProductArtwork compact category={product.category} name={product.name} />
                </td>
                <td className="max-w-[270px] px-4 py-3">
                  <Link
                    href={`/products/${encodeURIComponent(product.id)}`}
                    className="font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
                  >
                    {product.name}
                  </Link>
                  <span className="mt-1 block text-xs text-muted-foreground">{product.sku}</span>
                </td>
                <td className="px-4 py-3 font-semibold">{product.brand}</td>
                <td className="max-w-[220px] px-4 py-3 text-xs text-muted-foreground">
                  {product.category}
                </td>
                <td className="px-4 py-3 text-xs">{product.application}</td>
                <td className="w-40 px-4 py-3">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span>Calidad</span>
                    <strong>
                      {product.completeness === null
                        ? 'Regla pendiente'
                        : `${product.completeness}%`}
                    </strong>
                  </div>
                  {product.completeness === null ? (
                    <span className="text-xs text-muted-foreground">Sin puntaje aprobado</span>
                  ) : (
                    <Progress
                      value={product.completeness}
                      label={`Completitud de ${product.sku}`}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={statusTone(product.status)}>
                    {statusLabel(product.status)}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
}: {
  initialSearch?: string;
  initialBrand?: string;
  initialStatus?: ProductStatus | '';
}) {
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [brand, setBrand] = useState(initialBrand);
  const [status, setStatus] = useState<ProductStatus | ''>(initialStatus);
  const [requestedPage, setRequestedPage] = useState(1);
  const [requestedPageSize, setRequestedPageSize] = useState(12);
  const [view, setView] = useState<CatalogView>('cards');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setRequestedPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const update = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };

    update('q', debouncedSearch);
    update('brand', brand);
    update('status', status);

    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      query ? `/products?${query}` : '/products',
    );
  }, [brand, debouncedSearch, status]);

  const { products, total, page, pageSize, totalPages, loading, error, reload } = useProductsData({
    q: debouncedSearch || undefined,
    brand: brand || undefined,
    status: status || undefined,
    page: requestedPage,
    pageSize: requestedPageSize,
  });

  const brands = useMemo(
    () => unique([...products.map((product) => product.brandFilter), brand || undefined]).sort(),
    [brand, products],
  );
  const statuses = useMemo<ProductStatus[]>(
    () =>
      Array.from(
        new Set([...products.map((product) => product.status), ...(status ? [status] : [])]),
      ).sort(),
    [products, status],
  );
  const activeFilterCount = [brand, status].filter(Boolean).length;
  const hasCriteria = Boolean(searchInput.trim() || debouncedSearch || activeFilterCount);
  const firstVisible = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, total);
  const searchPending = searchInput.trim() !== debouncedSearch;

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
  };

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Consulta la identidad, los códigos y el estado disponible de cada producto."
        actions={
          <Button variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw aria-hidden="true" className={cn('size-4', loading && 'animate-spin')} />
            Actualizar
          </Button>
        }
      />

      <ScreenGuide
        objective="Presenta los SKU maestros disponibles para buscarlos, compararlos y abrir su información detallada."
        actions={[
          'Busca por SKU, descripción o marca y combina la consulta con los filtros disponibles.',
          'Alterna entre tarjetas y tabla, cambia la cantidad de resultados y recorre las páginas.',
          'Abre cualquier producto para consultar sus atributos y usa «Actualizar» para volver a cargar la lista.',
        ]}
        dataSource="Los productos, estados y paginación provienen de la API del catálogo. La búsqueda, marca y estado se envían como criterios reales de la consulta."
        limitation="Categorías, aplicaciones y calidad permanecen identificadas como contrato pendiente. En esta pantalla los productos solo se consultan; no se crean ni editan."
      />

      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground">
            <span>Buscar en el catálogo</span>
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="SKU, descripción o marca"
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

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 md:hidden"
              onClick={() => setShowFilters((visible) => !visible)}
              aria-expanded={showFilters}
              aria-controls="catalog-filters"
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </Button>
            <div
              className="flex rounded-lg border p-1"
              role="group"
              aria-label="Formato del catálogo"
            >
              <Button
                variant={view === 'cards' ? 'dark' : 'ghost'}
                size="sm"
                onClick={() => setView('cards')}
                aria-pressed={view === 'cards'}
                aria-label="Ver como tarjetas"
              >
                <LayoutGrid aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Tarjetas</span>
              </Button>
              <Button
                variant={view === 'table' ? 'dark' : 'ghost'}
                size="sm"
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
                aria-label="Ver como tabla"
              >
                <ListIcon aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Tabla</span>
              </Button>
            </div>
          </div>
        </div>

        <div
          id="catalog-filters"
          className={cn(
            'mt-4 gap-3 border-t pt-4 md:grid md:grid-cols-2',
            showFilters ? 'grid' : 'hidden',
          )}
        >
          <Select label="Marca" value={brand} onChange={(event) => changeBrand(event.target.value)}>
            <option value="">Todas las marcas</option>
            {brands.map((item) => (
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
          <p className="text-xs leading-relaxed text-muted-foreground md:col-span-3">
            Las marcas visibles se obtienen de la página actual; el estado y los criterios de
            búsqueda se validan en el contrato compartido.
          </p>
        </div>

        {searchInput || activeFilterCount ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-xs text-muted-foreground">Criterios activos</span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X aria-hidden="true" className="size-3.5" />
              Limpiar todo
            </Button>
          </div>
        ) : null}
      </Card>

      {loading ? <CatalogSkeleton count={requestedPageSize} /> : null}
      {!loading && error ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar los productos"
          description={error}
          actionLabel="Reintentar"
          onAction={reload}
        />
      ) : null}
      {!loading && !error && products.length === 0 ? (
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

      {!loading && !error && products.length > 0 ? (
        <>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold" aria-live="polite">
              Mostrando {formatNumber(firstVisible)}–{formatNumber(lastVisible)}
              {' de '}
              {formatNumber(total)} productos
            </p>
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </p>
          </div>

          {view === 'cards' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <ProductTable products={products} />
          )}

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
                <option value={12}>12 productos</option>
                <option value={24}>24 productos</option>
                <option value={48}>48 productos</option>
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
