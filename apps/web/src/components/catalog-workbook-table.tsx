'use client';

import type {
  CatalogAttributeValue,
  CatalogWorkbookColumnDto,
  CatalogWorkbookProductDto,
  CatalogWorkbookResultDto,
  ProductStatus,
} from '@cdr/contracts';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  EXCEL_NOT_APPLICABLE,
  ExcelTableFilterBar,
  ExcelTableHeader,
  type ExcelTableCell,
  type ExcelTableColumn,
  useExcelTableRows,
} from '@/components/excel-table-filter';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DynamicCatalogApiError,
  fetchCatalogWorkbook,
  patchProductAttribute,
} from '@/lib/dynamic-catalog-api';
import { downloadCsv, downloadXlsx, type TabularData } from '@/lib/tabular-export';
import { cn, formatNumber } from '@/lib/utils';

type Notice = { tone: 'success' | 'error'; message: string } | null;
type EditingCell = {
  readonly productId: string;
  readonly attributeKey: string;
  readonly version: number;
  readonly draft: string;
};

type WorkbookColumn = ExcelTableColumn<CatalogWorkbookProductDto, string> & {
  readonly group: 'identity' | 'erp' | 'attribute';
  readonly attribute?: CatalogWorkbookColumnDto;
  readonly exportable: boolean;
};

export const WORKBOOK_EXPORT_LIMIT = 5_000;
const WORKBOOK_EXPORT_PAGE_SIZE = 100;

export function serializeWorkbookColumnFilters(
  filters: Partial<Record<string, ReadonlySet<string>>>,
): string[] {
  return Object.entries(filters)
    .filter((entry): entry is [string, ReadonlySet<string>] => Boolean(entry[1]?.size))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => JSON.stringify({ key, values: [...values].sort() }));
}

export function serializeWorkbookSort(
  sort: { readonly key: string; readonly direction: 'asc' | 'desc' } | null,
): string | undefined {
  return sort ? JSON.stringify(sort) : undefined;
}

const baseColumns: readonly WorkbookColumn[] = [
  {
    key: 'base:sku',
    label: 'SKU',
    group: 'identity',
    exportable: true,
    getValue: (row) => row.sku,
  },
  {
    key: 'base:name',
    label: 'Descripción',
    group: 'identity',
    exportable: true,
    getValue: (row) => row.name,
  },
  {
    key: 'base:template',
    label: 'Plantilla',
    group: 'identity',
    exportable: true,
    getValue: (row) => row.template.name,
  },
  {
    key: 'base:status',
    label: 'Estado · completitud',
    group: 'identity',
    exportable: true,
    getValue: (row) => `${statusLabel(row.status as ProductStatus)} · ${row.completeness}%`,
  },
  {
    key: 'base:provider',
    label: 'Código de proveedor',
    group: 'erp',
    exportable: true,
    getValue: (row) => row.providerCode,
  },
  {
    key: 'base:unifier',
    label: 'Código unificador',
    group: 'erp',
    exportable: true,
    getValue: (row) => row.unifiedCode,
  },
  {
    key: 'base:category',
    label: 'Línea / categoría',
    group: 'erp',
    exportable: true,
    getValue: (row) => row.category.name,
  },
  {
    key: 'base:brand',
    label: 'Marca',
    group: 'erp',
    exportable: true,
    getValue: (row) => row.brand,
  },
  {
    key: 'base:application',
    label: 'Tipo de aplicación',
    group: 'erp',
    exportable: true,
    getValue: (row) => row.applicationTypes.join(', '),
  },
];

function attributeCell(row: CatalogWorkbookProductDto, key: string): ExcelTableCell {
  const cell = row.attributes[key];
  return !cell || !cell.applicable ? EXCEL_NOT_APPLICABLE : cell.value;
}

function displayCell(value: ExcelTableCell): string {
  if (value === EXCEL_NOT_APPLICABLE) return 'No aplica';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

export function parseWorkbookDraft(
  column: CatalogWorkbookColumnDto,
  raw: string,
):
  | { kind: 'noop' }
  | { kind: 'value'; value: CatalogAttributeValue | null }
  | { kind: 'error'; message: string } {
  const draft = raw.trim();
  if (!draft) return { kind: 'noop' };
  if (draft === '-') {
    return column.required
      ? { kind: 'error', message: `${column.label} es obligatorio y no se puede vaciar.` }
      : { kind: 'value', value: null };
  }
  if (column.dataType === 'number' || column.dataType === 'measurement') {
    const value = Number(draft.replace(',', '.'));
    return Number.isFinite(value)
      ? { kind: 'value', value }
      : { kind: 'error', message: `${column.label} requiere un número.` };
  }
  if (column.dataType === 'boolean') {
    const normalized = draft.toLocaleLowerCase('es');
    if (['sí', 'si', 'true', '1'].includes(normalized)) return { kind: 'value', value: true };
    if (['no', 'false', '0'].includes(normalized)) return { kind: 'value', value: false };
    return { kind: 'error', message: `${column.label} acepta Sí o No.` };
  }
  if (column.dataType === 'date' && !/^\d{4}-\d{2}-\d{2}$/u.test(draft)) {
    return { kind: 'error', message: `${column.label} requiere una fecha AAAA-MM-DD.` };
  }
  if (column.dataType === 'enum') {
    const value = column.allowedValues.find(
      (option) => option.toLocaleLowerCase('es') === draft.toLocaleLowerCase('es'),
    );
    return value
      ? { kind: 'value', value }
      : { kind: 'error', message: `${column.label} requiere un valor de la lista.` };
  }
  return { kind: 'value', value: draft };
}

function editableDraft(value: CatalogAttributeValue | null): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

export function CatalogWorkbookTable({
  q,
  brand,
  status,
  categoryId,
  applicationType,
  completeness,
  canEdit,
  onFacetsChange,
}: {
  readonly q?: string;
  readonly brand?: string;
  readonly status?: ProductStatus;
  readonly categoryId?: string;
  readonly applicationType?: 'AUTOMOTRIZ' | 'INDUSTRIAL';
  readonly completeness?: 'complete' | 'attention' | 'critical';
  readonly canEdit: boolean;
  readonly onFacetsChange?: (facets: CatalogWorkbookResultDto['facets']) => void;
}) {
  const [rows, setRows] = useState<CatalogWorkbookProductDto[]>([]);
  const [dynamicColumns, setDynamicColumns] = useState<CatalogWorkbookColumnDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const columns = useMemo<WorkbookColumn[]>(
    () => [
      ...baseColumns,
      ...dynamicColumns.map((attribute) => ({
        key: `attribute:${attribute.key}`,
        label: `${attribute.label}${attribute.unit ? ` (${attribute.unit})` : ''}`,
        group: 'attribute' as const,
        attribute,
        exportable: attribute.permissions.export,
        getValue: (row: CatalogWorkbookProductDto) => attributeCell(row, attribute.key),
      })),
    ],
    [dynamicColumns],
  );
  const table = useExcelTableRows({
    rows,
    columns,
    initialSort: { key: 'base:sku', direction: 'asc' },
  });
  const serializedColumnFilters = useMemo(
    () => serializeWorkbookColumnFilters(table.filters),
    [table.filters],
  );
  const serializedColumnFilterKey = serializedColumnFilters.join('\u001f');
  const serializedSort = serializeWorkbookSort(table.sort);

  useEffect(
    () => setPage(1),
    [
      applicationType,
      brand,
      categoryId,
      completeness,
      q,
      serializedColumnFilterKey,
      serializedSort,
      status,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchCatalogWorkbook(
      {
        page,
        pageSize,
        filter: [],
        columnFilter: serializedColumnFilters,
        ...(serializedSort ? { sort: serializedSort } : {}),
        ...(q ? { q } : {}),
        ...(brand ? { brand } : {}),
        ...(status ? { status } : {}),
        ...(applicationType ? { applicationType } : {}),
        ...(completeness ? { completeness } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      controller.signal,
    )
      .then((result) => {
        setRows(result.items);
        setDynamicColumns(
          result.columns.filter(
            (column) => !['codigo_proveedor', 'codigo_unificador'].includes(column.key),
          ),
        );
        setTotal(result.total);
        onFacetsChange?.(result.facets);
        setEditing(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        setRows([]);
        setDynamicColumns([]);
        setTotal(0);
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo cargar la tabla del catálogo.',
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [
    applicationType,
    brand,
    categoryId,
    completeness,
    onFacetsChange,
    page,
    pageSize,
    q,
    revision,
    serializedColumnFilterKey,
    serializedSort,
    status,
  ]);
  const columnLabels = useMemo(
    () => new Map(columns.map((column) => [column.key, column.label])),
    [columns],
  );
  const exportColumns = columns.filter((column) => column.exportable);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const makeExportData = (products: readonly CatalogWorkbookProductDto[]): TabularData => ({
    headers: exportColumns.map((column) => column.label),
    rows: products.map((row) =>
      exportColumns.map((column) => {
        if (column.attribute) {
          const cell = row.attributes[column.attribute.key];
          if (cell?.applicable && !cell.permissions.export) return '';
        }
        const value = column.getValue(row);
        return value === EXCEL_NOT_APPLICABLE ? '(No aplica)' : (value ?? '');
      }),
    ),
    sheetName: 'Productos',
  });

  const exportFilteredView = async (format: 'csv' | 'xlsx') => {
    if (exporting || total === 0) return;
    if (total > WORKBOOK_EXPORT_LIMIT) {
      setNotice({
        tone: 'error',
        message: `La vista contiene ${formatNumber(total)} filas. Ajusta los filtros para exportar un máximo seguro de ${formatNumber(WORKBOOK_EXPORT_LIMIT)}.`,
      });
      return;
    }
    setExporting(true);
    setNotice(null);
    try {
      const allRows: CatalogWorkbookProductDto[] = [];
      let exportPage = 1;
      let expectedTotal = total;
      while (allRows.length < expectedTotal) {
        const result = await fetchCatalogWorkbook({
          page: exportPage,
          pageSize: WORKBOOK_EXPORT_PAGE_SIZE,
          filter: [],
          columnFilter: serializedColumnFilters,
          ...(serializedSort ? { sort: serializedSort } : {}),
          ...(q ? { q } : {}),
          ...(brand ? { brand } : {}),
          ...(status ? { status } : {}),
          ...(applicationType ? { applicationType } : {}),
          ...(completeness ? { completeness } : {}),
          ...(categoryId ? { categoryId } : {}),
        });
        expectedTotal = result.total;
        if (expectedTotal > WORKBOOK_EXPORT_LIMIT) {
          throw new Error(
            `La vista supera el máximo seguro de ${formatNumber(WORKBOOK_EXPORT_LIMIT)} filas. Ajusta los filtros e inténtalo nuevamente.`,
          );
        }
        allRows.push(...result.items);
        if (result.items.length === 0 || allRows.length >= expectedTotal) break;
        exportPage += 1;
      }
      if (allRows.length !== expectedTotal) {
        throw new Error(
          'La exportación quedó incompleta. Actualiza la vista e inténtalo nuevamente.',
        );
      }
      const data = makeExportData(allRows);
      if (format === 'csv') downloadCsv(data, 'catalogo-pim-vista-filtrada');
      else downloadXlsx(data, 'catalogo-pim-vista-filtrada');
      setNotice({
        tone: 'success',
        message: `Se exportaron ${formatNumber(allRows.length)} filas con los filtros y el orden actuales.`,
      });
    } catch (exportError) {
      setNotice({
        tone: 'error',
        message:
          exportError instanceof Error
            ? exportError.message
            : 'No fue posible exportar la vista filtrada.',
      });
    } finally {
      setExporting(false);
    }
  };

  const saveEdit = async (column: CatalogWorkbookColumnDto) => {
    if (!editing || saving) return;
    const parsed = parseWorkbookDraft(column, editing.draft);
    if (parsed.kind === 'noop') {
      setEditing(null);
      return;
    }
    if (parsed.kind === 'error') {
      setNotice({ tone: 'error', message: parsed.message });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const updated = await patchProductAttribute(editing.productId, editing.attributeKey, {
        value: parsed.value,
        expectedVersion: editing.version,
      });
      setEditing(null);
      setNotice({
        tone: 'success',
        message:
          updated.replicatedProductIds.length > 0
            ? `Cambio guardado y replicado a ${updated.replicatedProductIds.length} SKU del código unificador.`
            : 'Cambio guardado y registrado en auditoría.',
      });
      setRevision((value) => value + 1);
    } catch (saveError) {
      const conflict = saveError instanceof DynamicCatalogApiError && saveError.status === 409;
      setNotice({
        tone: 'error',
        message: conflict
          ? 'Otro usuario modificó la celda. La tabla se actualizará para evitar sobrescribirlo.'
          : saveError instanceof Error
            ? saveError.message
            : 'No se pudo guardar la celda.',
      });
      if (conflict) setRevision((value) => value + 1);
    } finally {
      setSaving(false);
    }
  };

  if (loading && rows.length === 0) {
    return <Skeleton className="h-[480px] rounded-xl" aria-label="Cargando tabla del catálogo" />;
  }
  if (error) {
    return (
      <StatePanel
        variant="error"
        title="No pudimos cargar la tabla del catálogo"
        description={error}
        actionLabel="Reintentar"
        onAction={() => setRevision((value) => value + 1)}
      />
    );
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap gap-4">
          <span>Identidad y base ERP · solo lectura</span>
          <span>Haz clic en una celda PIM editable y pulsa Enter para guardar.</span>
          <span>“—” · vacío · tramado · no aplica</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRevision((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" className={cn('size-3.5', loading && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading || exporting || total === 0}
            onClick={() => void exportFilteredView('csv')}
            title={`Exporta toda la vista filtrada (máximo ${formatNumber(WORKBOOK_EXPORT_LIMIT)} filas)`}
          >
            <Download aria-hidden="true" className="size-4" />
            CSV · {formatNumber(total)} {total === 1 ? 'fila' : 'filas'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading || exporting || total === 0}
            onClick={() => void exportFilteredView('xlsx')}
            title={`Exporta toda la vista filtrada (máximo ${formatNumber(WORKBOOK_EXPORT_LIMIT)} filas)`}
          >
            <FileSpreadsheet aria-hidden="true" className="size-4" />
            XLSX · {formatNumber(total)} {total === 1 ? 'fila' : 'filas'}
          </Button>
        </div>
      </div>

      {notice ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs',
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800',
          )}
        >
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}

      <ExcelTableFilterBar
        filteredColumns={table.filteredColumnKeys.map((key) => columnLabels.get(key) ?? key)}
        sort={
          table.sort
            ? {
                label: columnLabels.get(table.sort.key) ?? table.sort.key,
                direction: table.sort.direction,
              }
            : undefined
        }
        visibleCount={table.visibleRows.length}
        totalCount={total}
        onClear={table.clear}
      />

      <div className="scrollbar-thin max-w-full overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-left text-xs" aria-busy={loading}>
          <caption className="sr-only">
            Tabla dinámica del catálogo con atributos de las plantillas activas
          </caption>
          <thead className="sticky top-0 z-10 border-b bg-white text-[11px] text-muted-foreground">
            <tr className="border-b text-[10px] font-extrabold uppercase tracking-[0.06em] text-orange-700">
              <th colSpan={4} className="bg-orange-50 px-3 py-2.5">
                Identificación
              </th>
              <th colSpan={5} className="border-l bg-orange-50 px-3 py-2.5">
                Base ERP · solo lectura
              </th>
              {dynamicColumns.length > 0 ? (
                <th colSpan={dynamicColumns.length} className="border-l bg-slate-50 px-3 py-2.5">
                  Atributos de plantilla · permisos por rol
                </th>
              ) : null}
              <th className="bg-slate-50 px-3 py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
            <tr>
              {columns.map((column, index) => (
                <ExcelTableHeader
                  key={column.key}
                  columnKey={column.key}
                  label={column.label}
                  options={table.getValueOptions(column.key)}
                  selectedValues={table.filters[column.key]}
                  sortDirection={table.sort?.key === column.key ? table.sort.direction : undefined}
                  onFilterChange={(values) => {
                    setPage(1);
                    table.setColumnFilter(column.key, values);
                  }}
                  onSort={(direction) => {
                    setPage(1);
                    table.setSort(column.key, direction);
                  }}
                  className={cn(
                    'max-w-[240px] border-r last:border-r-0',
                    (index === 4 || index === 9) && 'border-l-2 border-l-orange-200',
                  )}
                />
              ))}
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {table.visibleRows.map((row) => (
              <tr key={row.id} className="hover:bg-orange-50/40">
                {columns.map((column, index) => {
                  if (!column.attribute) {
                    const value = column.getValue(row);
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          'max-w-[280px] border-r px-3 py-2.5',
                          index === 4 && 'border-l-2 border-l-orange-200',
                        )}
                      >
                        {column.key === 'base:sku' ? (
                          <Link
                            href={`/products/${encodeURIComponent(row.id)}`}
                            className="whitespace-nowrap font-semibold hover:text-primary"
                          >
                            {row.sku}
                          </Link>
                        ) : column.key === 'base:status' ? (
                          <span className="flex min-w-max items-center gap-2">
                            <StatusBadge tone={statusTone(row.status as ProductStatus)}>
                              {statusLabel(row.status as ProductStatus)}
                            </StatusBadge>
                            <span className="font-semibold tabular-nums">{row.completeness}%</span>
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'line-clamp-2',
                              (column.key === 'base:provider' || column.key === 'base:unifier') &&
                                'font-mono text-[11px]',
                            )}
                          >
                            {displayCell(value)}
                          </span>
                        )}
                      </td>
                    );
                  }
                  const attribute = column.attribute;
                  const cell = row.attributes[attribute.key];
                  if (!cell || !cell.applicable) {
                    return (
                      <td
                        key={column.key}
                        aria-label={`${attribute.label}: no aplica`}
                        className="min-w-32 border-r bg-[repeating-linear-gradient(135deg,#f8fafc,#f8fafc_5px,#e2e8f0_5px,#e2e8f0_6px)] px-3 py-2.5 text-center text-[10px] italic text-slate-500"
                      >
                        No aplica
                      </td>
                    );
                  }
                  const isEditing =
                    editing?.productId === row.id && editing.attributeKey === attribute.key;
                  const editable = canEdit && cell.permissions.edit;
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        'min-w-36 border-r px-2 py-1.5',
                        editable && 'bg-blue-50/35',
                        cell.required && cell.value === null && 'bg-red-50',
                      )}
                    >
                      {isEditing ? (
                        <span className="flex min-w-40 items-center gap-1">
                          {attribute.dataType === 'enum' ? (
                            <Select
                              label="Valor"
                              aria-label={`Editar ${attribute.label} de ${row.sku}`}
                              value={editing.draft}
                              onChange={(event) =>
                                setEditing({ ...editing, draft: event.target.value })
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') setEditing(null);
                                if (event.key === 'Enter') void saveEdit(attribute);
                              }}
                              autoFocus
                            >
                              <option value="">Sin cambio</option>
                              {!attribute.required ? <option value="-">— Vaciar</option> : null}
                              {attribute.allowedValues.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </Select>
                          ) : attribute.dataType === 'boolean' ? (
                            <Select
                              label="Valor"
                              aria-label={`Editar ${attribute.label} de ${row.sku}`}
                              value={editing.draft}
                              onChange={(event) =>
                                setEditing({ ...editing, draft: event.target.value })
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') setEditing(null);
                                if (event.key === 'Enter') void saveEdit(attribute);
                              }}
                              autoFocus
                            >
                              <option value="">Sin cambio</option>
                              {!attribute.required ? <option value="-">— Vaciar</option> : null}
                              <option value="Sí">Sí</option>
                              <option value="No">No</option>
                            </Select>
                          ) : (
                            <Input
                              autoFocus
                              type="text"
                              aria-label={`Editar ${attribute.label} de ${row.sku}`}
                              value={editing.draft}
                              placeholder={
                                attribute.required
                                  ? 'Valor obligatorio'
                                  : 'Vacío=no cambia · -=vacía'
                              }
                              onChange={(event) =>
                                setEditing({ ...editing, draft: event.target.value })
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') setEditing(null);
                                if (event.key === 'Enter') void saveEdit(attribute);
                              }}
                              className="h-8 min-w-36 text-xs"
                            />
                          )}
                          <button
                            type="button"
                            aria-label={`Guardar ${attribute.label}`}
                            disabled={saving}
                            onClick={() => void saveEdit(attribute)}
                            className="grid size-7 shrink-0 place-items-center rounded-md text-emerald-700 hover:bg-emerald-100"
                          >
                            <Check aria-hidden="true" className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancelar ${attribute.label}`}
                            disabled={saving}
                            onClick={() => setEditing(null)}
                            className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-slate-100"
                          >
                            <X aria-hidden="true" className="size-4" />
                          </button>
                        </span>
                      ) : editable ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setEditing({
                              productId: row.id,
                              attributeKey: attribute.key,
                              version: cell.version,
                              draft: editableDraft(cell.value),
                            });
                          }}
                          className="group flex min-h-8 w-full items-center justify-between gap-2 rounded px-1 text-left hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
                          aria-label={`Editar ${attribute.label} de ${row.sku}`}
                        >
                          <span>{displayCell(cell.value)}</span>
                          <Pencil
                            aria-hidden="true"
                            className="size-3 shrink-0 text-blue-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                          />
                        </button>
                      ) : (
                        <span className="block min-h-8 px-1 py-1.5">{displayCell(cell.value)}</span>
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/products/${encodeURIComponent(row.id)}`}>Abrir</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {table.visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {rows.length === 0
                    ? 'No hay productos para los criterios seleccionados.'
                    : 'Ninguna fila de esta página cumple los filtros de columna.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
        <span>
          {total === 0
            ? '0 productos'
            : `${formatNumber((page - 1) * pageSize + 1)}–${formatNumber(Math.min(page * pageSize, total))} de ${formatNumber(total)}`}{' '}
          · filtros de columna y exportación aplican a toda la consulta
        </span>
        <div className="flex items-center gap-2">
          <Select
            label="Filas por página"
            aria-label="Filas por página de la tabla"
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} filas
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft aria-hidden="true" className="size-4" /> Anterior
          </Button>
          <span>
            Página {page} de {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Siguiente <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
