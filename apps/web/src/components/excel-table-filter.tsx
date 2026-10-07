'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, Search, X } from 'lucide-react';
import {
  type ChangeEvent,
  type CSSProperties,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const EXCEL_EMPTY = '__cdr_excel_empty__';
export const EXCEL_NOT_APPLICABLE = '__cdr_excel_not_applicable__';

export type ExcelTableCell =
  string | number | boolean | null | undefined | typeof EXCEL_NOT_APPLICABLE;
export type ExcelSortDirection = 'asc' | 'desc';

export interface ExcelTableColumn<Row, Key extends string = string> {
  readonly key: Key;
  readonly label: string;
  readonly getValue: (row: Row) => ExcelTableCell;
}

export interface ExcelTableValueOption {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

export interface ExcelTableSort<Key extends string = string> {
  readonly key: Key;
  readonly direction: ExcelSortDirection;
}

interface NormalizedCell {
  readonly key: string;
  readonly label: string;
  readonly value: string | number | boolean | null;
  readonly rank: number;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');
}

export function normalizeExcelTableCell(value: ExcelTableCell): NormalizedCell {
  if (value === EXCEL_NOT_APPLICABLE) {
    return {
      key: EXCEL_NOT_APPLICABLE,
      label: '(No aplica)',
      value: null,
      rank: 1,
    };
  }
  const normalizedValue = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : value;
  if (normalizedValue === null || normalizedValue === undefined || normalizedValue === '') {
    return { key: EXCEL_EMPTY, label: '(Vacías)', value: null, rank: 2 };
  }
  const label =
    typeof normalizedValue === 'boolean'
      ? normalizedValue
        ? 'Sí'
        : 'No'
      : String(normalizedValue);
  return { key: `value:${label}`, label, value: normalizedValue, rank: 0 };
}

const excelCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function compareCells(left: NormalizedCell, right: NormalizedCell): number {
  if (left.rank !== right.rank) return left.rank - right.rank;
  if (left.rank > 0) return 0;
  if (typeof left.value === 'number' && typeof right.value === 'number') {
    return left.value - right.value;
  }
  return excelCollator.compare(left.label, right.label);
}

type ExcelFilters<Key extends string> = Partial<Record<Key, ReadonlySet<string>>>;

export interface UseExcelTableRowsOptions<Row, Key extends string> {
  readonly rows: readonly Row[];
  readonly columns: readonly ExcelTableColumn<Row, Key>[];
  readonly initialSort?: ExcelTableSort<Key>;
}

export interface ExcelTableRowsModel<Row, Key extends string> {
  readonly visibleRows: Row[];
  readonly filters: ExcelFilters<Key>;
  readonly sort: ExcelTableSort<Key> | null;
  readonly filteredColumnKeys: Key[];
  readonly getValueOptions: (key: Key) => ExcelTableValueOption[];
  readonly setColumnFilter: (key: Key, values?: ReadonlySet<string>) => void;
  readonly setSort: (key: Key, direction: ExcelSortDirection) => void;
  readonly clear: () => void;
}

/**
 * Applies spreadsheet-style filters after the caller's own/backend filters. Facet counts ignore
 * the current column while respecting every other active column, matching Excel's combined-filter
 * behaviour. Only rows supplied by the caller are ever exposed or exported.
 */
export function useExcelTableRows<Row, Key extends string>({
  rows,
  columns,
  initialSort,
}: UseExcelTableRowsOptions<Row, Key>): ExcelTableRowsModel<Row, Key> {
  const [filters, setFilters] = useState<ExcelFilters<Key>>({});
  const [sort, setSortState] = useState<ExcelTableSort<Key> | null>(initialSort ?? null);

  const columnByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column] as const)),
    [columns],
  );

  const passesFilters = (row: Row, except?: Key): boolean =>
    columns.every((column) => {
      if (column.key === except) return true;
      const accepted = filters[column.key];
      if (!accepted) return true;
      return accepted.has(normalizeExcelTableCell(column.getValue(row)).key);
    });

  const visibleRows = useMemo(() => {
    const filtered = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => passesFilters(row));
    if (!sort) return filtered.map(({ row }) => row);
    const column = columnByKey.get(sort.key);
    if (!column) return filtered.map(({ row }) => row);
    const direction = sort.direction === 'asc' ? 1 : -1;
    return filtered
      .map(({ row, index }) => ({
        row,
        index,
        cell: normalizeExcelTableCell(column.getValue(row)),
      }))
      .sort((left, right) => {
        // Vacías and No aplica remain at the end in either direction.
        if (left.cell.rank !== right.cell.rank) return left.cell.rank - right.cell.rank;
        const comparison = compareCells(left.cell, right.cell);
        return comparison === 0 ? left.index - right.index : comparison * direction;
      })
      .map(({ row }) => row);
  }, [columnByKey, columns, filters, rows, sort]);

  const getValueOptions = (key: Key): ExcelTableValueOption[] => {
    const column = columnByKey.get(key);
    if (!column) return [];
    const counts = new Map<string, ExcelTableValueOption>();
    rows
      .filter((row) => passesFilters(row, key))
      .forEach((row) => {
        const cell = normalizeExcelTableCell(column.getValue(row));
        const current = counts.get(cell.key);
        counts.set(cell.key, {
          key: cell.key,
          label: cell.label,
          count: (current?.count ?? 0) + 1,
        });
      });
    filters[key]?.forEach((selectedKey) => {
      if (counts.has(selectedKey)) return;
      const label =
        selectedKey === EXCEL_EMPTY
          ? '(Vacías)'
          : selectedKey === EXCEL_NOT_APPLICABLE
            ? '(No aplica)'
            : selectedKey.replace(/^value:/u, '');
      counts.set(selectedKey, { key: selectedKey, label, count: 0 });
    });
    return [...counts.values()].sort((left, right) => {
      const leftCell = normalizeExcelTableCell(
        left.key === EXCEL_EMPTY
          ? null
          : left.key === EXCEL_NOT_APPLICABLE
            ? EXCEL_NOT_APPLICABLE
            : left.label,
      );
      const rightCell = normalizeExcelTableCell(
        right.key === EXCEL_EMPTY
          ? null
          : right.key === EXCEL_NOT_APPLICABLE
            ? EXCEL_NOT_APPLICABLE
            : right.label,
      );
      return compareCells(leftCell, rightCell);
    });
  };

  const setColumnFilter = (key: Key, values?: ReadonlySet<string>) => {
    setFilters((current) => {
      const next = { ...current };
      if (!values) delete next[key];
      else next[key] = new Set(values);
      return next;
    });
  };

  const setSort = (key: Key, direction: ExcelSortDirection) => setSortState({ key, direction });

  return {
    visibleRows,
    filters,
    sort,
    filteredColumnKeys: columns.map((column) => column.key).filter((key) => Boolean(filters[key])),
    getValueOptions,
    setColumnFilter,
    setSort,
    clear: () => {
      setFilters({});
      setSortState(null);
    },
  };
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}

function usePopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  popoverRef: RefObject<HTMLDivElement | null>,
) {
  const [style, setStyle] = useState<CSSProperties>({ left: 8, top: 8 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = popover?.offsetWidth ?? 304;
      const height = popover?.offsetHeight ?? 420;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const below = rect.bottom + 6;
      const top = below + height <= window.innerHeight ? below : Math.max(8, rect.top - height - 6);
      setStyle({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [open, popoverRef, triggerRef]);

  return style;
}

export interface ExcelTableHeaderProps<Key extends string> {
  readonly columnKey: Key;
  readonly label: string;
  readonly options: readonly ExcelTableValueOption[];
  readonly selectedValues?: ReadonlySet<string>;
  readonly sortDirection?: ExcelSortDirection;
  readonly onFilterChange: (values?: ReadonlySet<string>) => void;
  readonly onSort: (direction: ExcelSortDirection) => void;
  readonly className?: string;
}

/** Accessible spreadsheet header with sorting and a searchable value checklist. */
export function ExcelTableHeader<Key extends string>({
  columnKey,
  label,
  options,
  selectedValues,
  sortDirection,
  onFilterChange,
  onSort,
  className,
}: ExcelTableHeaderProps<Key>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const popoverId = useId();
  const style = usePopoverPosition(open, triggerRef, popoverRef);
  const filtered = Boolean(selectedValues);

  const visibleOptions = useMemo(() => {
    const term = normalizeSearch(query.trim());
    return term
      ? options.filter((option) => normalizeSearch(option.label).includes(term))
      : [...options];
  }, [options, query]);
  const selectedVisible = visibleOptions.filter((option) => draft.has(option.key)).length;
  const allVisibleSelected = visibleOptions.length > 0 && selectedVisible === visibleOptions.length;

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openMenu = () => {
    setQuery('');
    setDraft(new Set(selectedValues ? [...selectedValues] : options.map((option) => option.key)));
    setOpen(true);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target))
        close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  const popover = open ? (
    <div
      ref={popoverRef}
      id={popoverId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={style}
      className="fixed z-50 flex w-[304px] max-w-[calc(100vw-16px)] flex-col gap-3 rounded-xl border bg-white p-3 text-xs normal-case tracking-normal text-foreground shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong id={titleId} className="block truncate text-sm">
            Filtrar {label}
          </strong>
          <span className="text-[10px] text-muted-foreground">
            {options.length} {options.length === 1 ? 'valor' : 'valores'} en las filas disponibles
          </span>
        </div>
        <button
          type="button"
          onClick={() => close(true)}
          aria-label={`Cerrar filtro de ${label}`}
          className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={sortDirection === 'asc' ? 'secondary' : 'outline'}
          aria-pressed={sortDirection === 'asc'}
          onClick={() => {
            onSort('asc');
            close(true);
          }}
        >
          <ArrowUp aria-hidden="true" className="size-3.5" /> A → Z
        </Button>
        <Button
          type="button"
          size="sm"
          variant={sortDirection === 'desc' ? 'secondary' : 'outline'}
          aria-pressed={sortDirection === 'desc'}
          onClick={() => {
            onSort('desc');
            close(true);
          }}
        >
          <ArrowDown aria-hidden="true" className="size-3.5" /> Z → A
        </Button>
      </div>

      <label className="relative block">
        <span className="sr-only">Buscar valor en {label}</span>
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar valor…"
          className="h-9 pl-9 text-xs"
        />
      </label>

      <div className="max-h-60 overflow-y-auto rounded-lg border" role="group" aria-label={label}>
        <label className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 font-semibold hover:bg-slate-50">
          <SelectAllCheckbox
            checked={allVisibleSelected}
            indeterminate={selectedVisible > 0 && !allVisibleSelected}
            onChange={(event) => {
              setDraft((current) => {
                const next = new Set(current);
                visibleOptions.forEach((option) => {
                  if (event.target.checked) next.add(option.key);
                  else next.delete(option.key);
                });
                return next;
              });
            }}
          />
          <span>(Seleccionar todo)</span>
        </label>
        {visibleOptions.map((option) => (
          <label
            key={option.key}
            className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              value={option.key}
              checked={draft.has(option.key)}
              onChange={(event) => {
                setDraft((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(option.key);
                  else next.delete(option.key);
                  return next;
                });
              }}
            />
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                (option.key === EXCEL_EMPTY || option.key === EXCEL_NOT_APPLICABLE) &&
                  'italic text-muted-foreground',
              )}
            >
              {option.label}
            </span>
            <span className="tabular-nums text-[10px] text-muted-foreground">{option.count}</span>
          </label>
        ))}
        {visibleOptions.length === 0 ? (
          <p className="px-3 py-4 text-center text-muted-foreground">Sin valores coincidentes.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!filtered}
          onClick={() => {
            onFilterChange(undefined);
            close(true);
          }}
        >
          Borrar filtro
        </Button>
        <span className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => close(true)}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={draft.size === 0}
          onClick={() => {
            const allSelected =
              options.length > 0 && options.every((option) => draft.has(option.key));
            onFilterChange(allSelected ? undefined : draft);
            close(true);
          }}
        >
          Aplicar
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <th
      scope="col"
      aria-sort={
        sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none'
      }
      data-column-key={columnKey}
      className={cn('relative px-3 py-3 font-semibold', className)}
    >
      <span className="flex min-w-max items-center gap-2">
        <span>{label}</span>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-label={`${label}: filtrar u ordenar${filtered ? ', filtro activo' : ''}${sortDirection ? `, orden ${sortDirection === 'asc' ? 'ascendente' : 'descendente'}` : ''}`}
          onClick={() => (open ? close(true) : openMenu())}
          className={cn(
            'grid size-6 place-items-center rounded-md border bg-white text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink',
            (filtered || sortDirection) && 'border-primary bg-primary text-white hover:text-white',
          )}
        >
          {filtered ? (
            <Filter aria-hidden="true" className="size-3" />
          ) : sortDirection === 'asc' ? (
            <ArrowUp aria-hidden="true" className="size-3" />
          ) : sortDirection === 'desc' ? (
            <ArrowDown aria-hidden="true" className="size-3" />
          ) : (
            <ChevronsUpDown aria-hidden="true" className="size-3" />
          )}
        </button>
      </span>
      {typeof document === 'undefined' || !popover ? null : createPortal(popover, document.body)}
    </th>
  );
}

export function ExcelTableFilterBar({
  filteredColumns,
  sort,
  visibleCount,
  totalCount,
  onClear,
}: {
  readonly filteredColumns: readonly string[];
  readonly sort?: { readonly label: string; readonly direction: ExcelSortDirection };
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly onClear: () => void;
}) {
  const active = filteredColumns.length > 0 || Boolean(sort);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-[11px]',
        active
          ? 'border-orange-200 bg-orange-50 text-orange-900'
          : 'bg-slate-50 text-muted-foreground',
      )}
      role="status"
      aria-live="polite"
    >
      <span className="leading-5">
        <Filter aria-hidden="true" className="mr-1.5 inline size-3.5 align-[-2px]" />
        {filteredColumns.length > 0 ? (
          <>
            Filtro por columna: <strong>{filteredColumns.join(', ')}</strong> ·{' '}
          </>
        ) : (
          <>Sin filtros de columna · </>
        )}
        {sort ? (
          <>
            Orden: <strong>{sort.label}</strong> {sort.direction === 'asc' ? 'A→Z' : 'Z→A'} ·{' '}
          </>
        ) : null}
        <strong>{visibleCount}</strong> de {totalCount}{' '}
        {totalCount === 1 ? 'fila visible' : 'filas visibles'}
      </span>
      {active ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Quitar filtros y orden de columna
        </Button>
      ) : null}
    </div>
  );
}
