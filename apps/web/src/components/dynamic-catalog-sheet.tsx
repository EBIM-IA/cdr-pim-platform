'use client';

import type {
  CatalogAttributeValue,
  CatalogGridColumnDto,
  CatalogGridProductDto,
  CatalogGridSchemaDto,
  CatalogCategorySummaryDto,
} from '@cdr/contracts';
import { Check, ChevronLeft, ChevronRight, Pencil, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DynamicCatalogApiError,
  fetchCatalogCategories,
  fetchCatalogGrid,
  fetchCatalogSchema,
  patchProductAttribute,
} from '@/lib/dynamic-catalog-api';
import { cn, formatNumber } from '@/lib/utils';

type FilterValues = Record<string, string>;
type Notice = { tone: 'success' | 'error'; message: string } | null;
type EditingCell = {
  productId: string;
  attributeKey: string;
  draft: string;
  version: number;
};

export function catalogFilterOperator(column: CatalogGridColumnDto): 'contains' | 'eq' {
  return column.dataType === 'text' ? 'contains' : 'eq';
}

export function serializeCatalogFilters(
  columns: readonly CatalogGridColumnDto[],
  values: FilterValues,
): string[] {
  return columns.flatMap((column) => {
    const value = values[column.key]?.trim();
    return value ? [`${column.key}:${catalogFilterOperator(column)}:${value}`] : [];
  });
}

function displayValue(value: CatalogAttributeValue | undefined, column: CatalogGridColumnDto) {
  if (value === undefined || value === '') return '—';
  if (column.dataType === 'boolean') return value === true || value === 'true' ? 'Sí' : 'No';
  return `${String(value)}${column.unit ? ` ${column.unit}` : ''}`;
}

function draftValue(
  value: CatalogAttributeValue | undefined,
  column: CatalogGridColumnDto,
): string {
  if (value !== undefined) return String(value);
  if (column.dataType === 'boolean') return 'false';
  if (column.dataType === 'enum' && column.required) return column.allowedValues[0] ?? '';
  return '';
}

function valueFromDraft(draft: string, column: CatalogGridColumnDto): CatalogAttributeValue {
  if (column.dataType === 'number' || column.dataType === 'measurement') {
    const value = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(value)) {
      throw new Error('Ingresa un número válido.');
    }
    return value;
  }
  if (column.dataType === 'boolean') return draft === 'true';
  return draft;
}

function AttributeFilter({
  column,
  value,
  onChange,
}: {
  column: CatalogGridColumnDto;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = `Filtrar por ${column.label}`;
  if (column.dataType === 'boolean') {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="mt-2 h-8 w-full min-w-24 rounded-md border bg-white px-2 text-xs font-normal normal-case tracking-normal outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
      >
        <option value="">Todos</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (column.dataType === 'enum' && column.allowedValues.length > 0) {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="mt-2 h-8 w-full min-w-32 rounded-md border bg-white px-2 text-xs font-normal normal-case tracking-normal outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
      >
        <option value="">Todos</option>
        {column.allowedValues.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={column.dataType === 'date' ? 'date' : column.dataType === 'text' ? 'search' : 'number'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      placeholder={column.dataType === 'text' ? 'Filtrar…' : undefined}
      className="mt-2 h-8 w-full min-w-28 rounded-md border bg-white px-2 text-xs font-normal normal-case tracking-normal outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-cdr-ink"
    />
  );
}

function AttributeEditor({
  column,
  draft,
  saving,
  onDraft,
  onSave,
  onCancel,
}: {
  column: CatalogGridColumnDto;
  draft: string;
  saving: boolean;
  onDraft: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const controlClass =
    'h-9 min-w-32 rounded-md border bg-white px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink';
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') onSave();
    if (event.key === 'Escape') onCancel();
  };
  const editor =
    column.dataType === 'boolean' ||
    (column.dataType === 'enum' && column.allowedValues.length > 0) ? (
      <select
        autoFocus
        aria-label={`Editar ${column.label}`}
        className={controlClass}
        value={draft}
        disabled={saving}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      >
        {column.dataType === 'boolean' ? (
          <>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </>
        ) : (
          <>
            {!column.required ? <option value="">Sin valor</option> : null}
            {column.allowedValues.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </>
        )}
      </select>
    ) : (
      <input
        autoFocus
        aria-label={`Editar ${column.label}`}
        className={controlClass}
        type={
          column.dataType === 'date'
            ? 'date'
            : column.dataType === 'number' || column.dataType === 'measurement'
              ? 'number'
              : 'text'
        }
        value={draft}
        disabled={saving}
        required={column.required}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    );

  return (
    <div className="flex min-w-48 items-center gap-1.5">
      {editor}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        aria-label={`Guardar ${column.label}`}
        className="grid size-9 shrink-0 place-items-center rounded-md bg-cdr-ink text-white disabled:opacity-50"
      >
        {saving ? <RefreshCw className="size-4 animate-spin" /> : <Check className="size-4" />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label={`Cancelar edición de ${column.label}`}
        className="grid size-9 shrink-0 place-items-center rounded-md border bg-white disabled:opacity-50"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function DynamicCatalogSheet() {
  const [categories, setCategories] = useState<CatalogCategorySummaryDto[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [schema, setSchema] = useState<CatalogGridSchemaDto | null>(null);
  const [products, setProducts] = useState<CatalogGridProductDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [debouncedFilters, setDebouncedFilters] = useState<FilterValues>({});
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [gridError, setGridError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const loadCategories = useCallback(() => {
    const controller = new AbortController();
    setCategoriesLoading(true);
    setCategoriesError(null);
    void fetchCatalogCategories(controller.signal)
      .then((result) => {
        setCategories(result);
        setCategoryId((current) =>
          result.some((category) => category.id === current) ? current : (result[0]?.id ?? ''),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCategoriesError(
          error instanceof Error ? error.message : 'No fue posible cargar las categorías.',
        );
      })
      .finally(() => setCategoriesLoading(false));
    return controller;
  }, []);

  useEffect(() => {
    const controller = loadCategories();
    return () => controller.abort();
  }, [loadCategories]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setDebouncedFilters(filters);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [filters, search]);

  useEffect(() => {
    if (!categoryId) {
      setSchema(null);
      return;
    }
    const controller = new AbortController();
    setSchemaLoading(true);
    setSchemaError(null);
    setSchema(null);
    void fetchCatalogSchema(categoryId, controller.signal)
      .then(setSchema)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSchemaError(error instanceof Error ? error.message : 'No se pudo cargar la plantilla.');
      })
      .finally(() => setSchemaLoading(false));
    return () => controller.abort();
  }, [categoryId, revision]);

  const serializedFilters = useMemo(
    () => serializeCatalogFilters(schema?.columns ?? [], debouncedFilters),
    [debouncedFilters, schema?.columns],
  );
  const filterKey = JSON.stringify(serializedFilters);

  useEffect(() => {
    if (!categoryId || !schema) {
      setProducts([]);
      setTotal(0);
      return;
    }
    const controller = new AbortController();
    setGridLoading(true);
    setGridError(null);
    void fetchCatalogGrid(
      {
        categoryId,
        page,
        pageSize,
        q: debouncedSearch || undefined,
        filter: serializedFilters,
      },
      controller.signal,
    )
      .then((result) => {
        setProducts(result.items);
        setTotal(result.total);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setProducts([]);
        setTotal(0);
        setGridError(error instanceof Error ? error.message : 'No se pudo cargar la hoja.');
      })
      .finally(() => setGridLoading(false));
    return () => controller.abort();
  }, [categoryId, debouncedSearch, filterKey, page, pageSize, revision, schema]);

  const selectCategory = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    setFilters({});
    setDebouncedFilters({});
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
    setEditing(null);
    setNotice(null);
  };

  const saveAttribute = async (column: CatalogGridColumnDto) => {
    if (!editing) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await patchProductAttribute(editing.productId, column.key, {
        value: valueFromDraft(editing.draft, column),
        expectedVersion: editing.version,
      });
      setNotice({
        tone: 'success',
        message:
          result.replicatedProductIds.length > 0
            ? `Atributo guardado y replicado a ${result.replicatedProductIds.length} SKU del código unificador.`
            : 'Atributo guardado correctamente.',
      });
      setEditing(null);
      setRevision((value) => value + 1);
    } catch (error) {
      if (error instanceof DynamicCatalogApiError && error.status === 409) {
        setNotice({
          tone: 'error',
          message:
            'Otra persona modificó este atributo. Recargamos el valor vigente; vuelve a intentar tu cambio.',
        });
        setEditing(null);
        setRevision((value) => value + 1);
      } else {
        setNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : 'No fue posible guardar el atributo.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstVisible = total ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, total);
  const hasFilters = Boolean(search.trim() || Object.values(filters).some((value) => value.trim()));

  if (categoriesLoading) {
    return (
      <div className="grid gap-3" aria-label="Cargando hoja de datos" aria-busy="true">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }
  if (categoriesError) {
    return (
      <StatePanel
        variant="error"
        title="No pudimos cargar las categorías"
        description={categoriesError}
        actionLabel="Reintentar"
        onAction={loadCategories}
      />
    );
  }
  if (categories.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="No hay categorías disponibles"
        description="Tu rol no tiene categorías activas con una plantilla visible."
      />
    );
  }

  return (
    <section aria-labelledby="dynamic-catalog-heading">
      <Card className="mb-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,0.75fr)_minmax(280px,1.25fr)_auto] lg:items-end">
          <Select
            label="Categoría y plantilla"
            value={categoryId}
            onChange={(event) => selectCategory(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} · v{category.templateVersion}
              </option>
            ))}
          </Select>
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            <span>Búsqueda general</span>
            <span className="relative block">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-10"
                placeholder="SKU, producto, marca o atributo buscable"
              />
            </span>
          </label>
          <div className="flex gap-2">
            {hasFilters ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setFilters({});
                }}
              >
                <X className="size-4" aria-hidden="true" />
                Limpiar
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
              disabled={schemaLoading || gridLoading}
            >
              <RefreshCw
                className={cn('size-4', (schemaLoading || gridLoading) && 'animate-spin')}
                aria-hidden="true"
              />
              Actualizar
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
          <h2 id="dynamic-catalog-heading" className="font-semibold text-foreground">
            Hoja de datos dinámica
          </h2>
          <span>{schema?.template.name ?? 'Cargando plantilla…'}</span>
          <span>Las columnas y permisos provienen de la plantilla activa.</span>
        </div>
      </Card>

      {notice ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'mb-4 rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900',
          )}
        >
          {notice.message}
        </div>
      ) : null}

      {schemaLoading ? <Skeleton className="h-80 rounded-xl" /> : null}
      {!schemaLoading && schemaError ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar la plantilla"
          description={schemaError}
          actionLabel="Reintentar"
          onAction={() => setRevision((value) => value + 1)}
        />
      ) : null}
      {!schemaLoading && !schemaError && gridError ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar la hoja de datos"
          description={gridError}
          actionLabel="Reintentar"
          onAction={() => setRevision((value) => value + 1)}
        />
      ) : null}
      {!schemaLoading && !schemaError && !gridError && schema ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold" aria-live="polite">
              {gridLoading
                ? 'Actualizando resultados…'
                : `Mostrando ${formatNumber(firstVisible)}–${formatNumber(lastVisible)} de ${formatNumber(total)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </p>
          </div>
          <Card className="min-w-0 overflow-hidden">
            <div className="scrollbar-thin max-w-full overflow-auto">
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <caption className="sr-only">
                  Productos y atributos técnicos configurados por la plantilla{' '}
                  {schema.template.name}
                </caption>
                <thead className="sticky top-0 z-10 border-b bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <tr className="align-top">
                    <th scope="col" className="sticky left-0 z-20 min-w-36 bg-slate-50 px-4 py-3">
                      SKU
                    </th>
                    <th scope="col" className="min-w-64 px-4 py-3">
                      Producto
                    </th>
                    <th scope="col" className="min-w-36 px-4 py-3">
                      Marca
                    </th>
                    <th scope="col" className="min-w-32 px-4 py-3">
                      Estado
                    </th>
                    {schema.columns.map((column) => (
                      <th key={column.id} scope="col" className="min-w-44 px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span>{column.label}</span>
                          {column.required ? <span title="Obligatorio">*</span> : null}
                        </div>
                        <AttributeFilter
                          column={column}
                          value={filters[column.key] ?? ''}
                          onChange={(value) =>
                            setFilters((current) => ({ ...current, [column.key]: value }))
                          }
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {gridLoading ? (
                    <tr>
                      <td colSpan={schema.columns.length + 4} className="p-4">
                        <Skeleton className="h-36 w-full" />
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td
                        colSpan={schema.columns.length + 4}
                        className="px-6 py-14 text-center text-muted-foreground"
                      >
                        {hasFilters
                          ? 'No hay productos que coincidan con estos criterios.'
                          : 'Esta categoría todavía no tiene productos asignados.'}
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr
                        key={product.id}
                        className="align-top transition-colors hover:bg-orange-50/40"
                      >
                        <td className="sticky left-0 z-[1] bg-white px-4 py-3 font-mono text-xs font-semibold group-hover:bg-orange-50">
                          <Link
                            href={`/products/${encodeURIComponent(product.id)}`}
                            className="hover:text-primary hover:underline"
                          >
                            {product.sku}
                          </Link>
                        </td>
                        <td className="max-w-80 px-4 py-3 font-semibold">{product.name}</td>
                        <td className="px-4 py-3">{product.brand ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">
                            {product.status}
                          </span>
                        </td>
                        {schema.columns.map((column) => {
                          const cell = product.attributes[column.key];
                          const isEditing =
                            editing?.productId === product.id &&
                            editing.attributeKey === column.key;
                          return (
                            <td key={column.id} className="px-4 py-3">
                              {isEditing && editing ? (
                                <AttributeEditor
                                  column={column}
                                  draft={editing.draft}
                                  saving={saving}
                                  onDraft={(draft) => setEditing({ ...editing, draft })}
                                  onSave={() => void saveAttribute(column)}
                                  onCancel={() => setEditing(null)}
                                />
                              ) : column.permissions.edit ? (
                                <button
                                  type="button"
                                  className="group/cell flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2 text-left hover:bg-white hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
                                  onClick={() =>
                                    setEditing({
                                      productId: product.id,
                                      attributeKey: column.key,
                                      draft: draftValue(cell?.value, column),
                                      version: cell?.version ?? 0,
                                    })
                                  }
                                  aria-label={`Editar ${column.label} de ${product.sku}`}
                                >
                                  <span>{displayValue(cell?.value, column)}</span>
                                  <Pencil
                                    className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/cell:opacity-70"
                                    aria-hidden="true"
                                  />
                                </button>
                              ) : (
                                <span>{displayValue(cell?.value, column)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <nav
            className="mt-5 flex flex-col gap-4 rounded-xl border bg-slate-50 p-4 sm:flex-row sm:items-end sm:justify-between"
            aria-label="Paginación de la hoja de datos"
          >
            <div className="w-full sm:w-48">
              <Select
                label="Resultados por página"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10 productos</option>
                <option value={25}>25 productos</option>
                <option value={50}>50 productos</option>
                <option value={100}>100 productos</option>
              </Select>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={gridLoading || page <= 1}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Anterior
              </Button>
              <span className="min-w-20 text-center text-sm font-semibold tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={gridLoading || page >= totalPages}
              >
                Siguiente
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        </>
      ) : null}
    </section>
  );
}
