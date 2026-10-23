'use client';

import type { WorkspaceDto, WorkspaceRow } from '@cdr/contracts';
import {
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  ExcelTableFilterBar,
  ExcelTableHeader,
  useExcelTableRows,
} from '@/components/excel-table-filter';
import { StatusBadge, type BadgeTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { downloadXlsx } from '@/lib/tabular-export';

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Título' },
  { key: 'description', label: 'Descripción' },
  { key: 'fileName', label: 'Archivo PDF' },
  { key: 'validFrom', label: 'Vigente desde' },
  { key: 'validUntil', label: 'Vigente hasta' },
  { key: 'status', label: 'Estado' },
  { key: 'links', label: 'Enlaces' },
  { key: 'createdBy', label: 'Creado por' },
  { key: 'createdAt', label: 'Fecha de creación' },
  { key: 'updatedBy', label: 'Modificado por' },
  { key: 'updatedAt', label: 'Fecha de modificación' },
] as const;
type ColumnKey = (typeof columns)[number]['key'];
const catalogValue = (row: WorkspaceRow, key: ColumnKey) =>
  key === 'id' ? row.id : (row.values[key] ?? null);
const tableColumns = columns.map((column) => ({
  ...column,
  getValue: (row: WorkspaceRow) => catalogValue(row, column.key),
}));
const maintenancePending = 'El mantenimiento de catálogos PDF todavía no está habilitado.';
const sharingPending = 'La compartición de catálogos PDF todavía no está habilitada.';
const statusTones: Record<string, BadgeTone> = {
  Vigente: 'success',
  'Por vencer': 'warning',
  Programado: 'info',
  Vencido: 'danger',
};

function displayValue(value: ReturnType<typeof catalogValue>, key: ColumnKey): string {
  if (value === null || value === '') return '—';
  if (typeof value !== 'string') return String(value);
  if (key === 'validFrom' || key === 'validUntil') {
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value.split('-').reverse().join('/') : value;
  }
  if (key === 'createdAt' || key === 'updatedAt') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    }
  }
  return value;
}

function UploadPreview({ onClose }: { onClose: () => void }) {
  return (
    <WorkspaceDrawer title="Subir catálogo" onClose={onClose}>
      <p
        role="status"
        className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
      >
        La carga de catálogos todavía no está habilitada. Este formulario muestra los datos que se
        solicitarán; no permite adjuntar, enviar ni guardar archivos.
      </p>
      <fieldset disabled className="space-y-4">
        <label className="grid gap-1.5 text-xs font-semibold">
          Título *
          <Input placeholder="p. ej. Catálogo de rodamientos SKF 2026" maxLength={120} />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold">
          Descripción
          <textarea
            rows={4}
            maxLength={1000}
            placeholder="Qué contiene, marcas, líneas, público…"
            className="w-full resize-y rounded-md border bg-white p-3 text-sm font-normal disabled:opacity-60"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold">
            Vigente desde *
            <Input type="date" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">
            Vigente hasta
            <Input type="date" />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs font-semibold">
          Catálogo en PDF *
          <Input type="file" accept="application/pdf,.pdf" />
        </label>
      </fieldset>
      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" disabled title={maintenancePending}>
          Subir catálogo
        </Button>
      </div>
    </WorkspaceDrawer>
  );
}

/** Presentation of the designer's PDF catalogue workspace. It never stores PDFs or creates links. */
export function ProductCatalogsWorkspace({
  workspace,
  onReload,
}: {
  workspace: WorkspaceDto;
  onReload?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [uploadPreview, setUploadPreview] = useState(false);
  const [detail, setDetail] = useState<WorkspaceRow | null>(null);
  const searched = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase('es').split(/\s+/u).filter(Boolean);
    return workspace.rows.filter((row) => {
      const text = [row.id, ...Object.values(row.values)].join(' ').toLocaleLowerCase('es');
      return tokens.every((token) => text.includes(token));
    });
  }, [workspace.rows, query]);
  const table = useExcelTableRows({ rows: searched, columns: tableColumns });
  const total =
    workspace.metrics.find((metric) => metric.key === 'catalogs')?.value ?? workspace.totalRows;
  const allSelected =
    table.visibleRows.length > 0 && table.visibleRows.every((row) => selected.has(row.id));
  const changeSelection = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const exportVisible = () => {
    if (!table.visibleRows.length) return;
    downloadXlsx(
      {
        headers: columns.map((column) => column.label),
        rows: table.visibleRows.map((row) =>
          columns.map((column) => catalogValue(row, column.key)),
        ),
      },
      'catalogos.xlsx',
    );
  };
  const removeFilters = () => {
    setQuery('');
    table.clear();
  };

  return (
    <div className="min-w-0 space-y-4">
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm"
        role="toolbar"
        aria-label="Acciones de catálogos"
      >
        <Button type="button" size="sm" onClick={() => setUploadPreview(true)}>
          <Plus className="size-3.5" aria-hidden="true" /> Subir catálogo
        </Button>
        <Button type="button" size="sm" variant="outline" disabled title={maintenancePending}>
          <Pencil className="size-3.5" aria-hidden="true" /> Editar
        </Button>
        <Button type="button" size="sm" variant="outline" disabled title={sharingPending}>
          <Share2 className="size-3.5" aria-hidden="true" /> Compartir
        </Button>
        <Button type="button" size="sm" variant="outline" disabled title={maintenancePending}>
          <Trash2 className="size-3.5" aria-hidden="true" /> Eliminar
        </Button>
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!table.visibleRows.length}
          onClick={exportVisible}
        >
          <Download className="size-3.5" aria-hidden="true" /> Exportar Excel
        </Button>
        <label className="relative min-w-60 flex-1 sm:ml-auto">
          <span className="sr-only">Buscar catálogos</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            className="h-9 pl-9 text-xs"
            placeholder="Buscar por título, descripción, archivo o usuario…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {workspace.rows.length ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Catálogos',
                value: total,
                note: 'cargados en PDF',
                icon: FileText,
                color: 'bg-orange-50 text-primary',
              },
              {
                label: 'Vigentes',
                value: '—',
                note: 'Vigencia todavía no disponible',
                icon: CheckCircle2,
                color: 'bg-emerald-50 text-emerald-700',
              },
              {
                label: 'Vencidos / programados',
                value: '— / —',
                note: 'Estado de vigencia no disponible',
                icon: Clock3,
                color: 'bg-amber-50 text-amber-700',
              },
              {
                label: 'Enlaces activos',
                value: '—',
                note: 'Compartición todavía no habilitada',
                icon: Link2,
                color: 'bg-blue-50 text-blue-700',
              },
            ].map(({ label, value, note, icon: Icon, color }) => (
              <Card key={label} className="flex items-start gap-3 p-4">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${color}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="my-1 text-2xl font-bold tabular-nums">{value}</dd>
                  <p className="text-[11px] text-muted-foreground">{note}</p>
                </div>
              </Card>
            ))}
          </dl>

          <Card className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">
                  Catálogos · {table.visibleRows.length}
                  {workspace.totalRows !== table.visibleRows.length
                    ? ` de ${workspace.totalRows}`
                    : ''}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clic en el título para ver el detalle y su historial. Marca un catálogo para las
                  acciones de la barra.
                </p>
              </div>
              {onReload ? (
                <Button type="button" variant="ghost" size="sm" onClick={onReload}>
                  <RefreshCw className="size-3.5" aria-hidden="true" /> Actualizar
                </Button>
              ) : null}
            </div>
            <ExcelTableFilterBar
              filteredColumns={table.filteredColumnKeys.map(
                (key) => columns.find((column) => column.key === key)?.label ?? key,
              )}
              sort={
                table.sort
                  ? {
                      label:
                        columns.find((column) => column.key === table.sort?.key)?.label ??
                        table.sort.key,
                      direction: table.sort.direction,
                    }
                  : undefined
              }
              visibleCount={table.visibleRows.length}
              totalCount={workspace.totalRows}
              onClear={removeFilters}
            />
            <div className="overflow-x-auto" tabIndex={0} aria-label="Tabla de catálogos PDF">
              <table className="w-full min-w-[1580px] border-collapse text-left text-xs">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 w-10 bg-slate-50 px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los visibles"
                        checked={allSelected}
                        disabled={!table.visibleRows.length}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const row of table.visibleRows) {
                              if (event.target.checked) next.add(row.id);
                              else next.delete(row.id);
                            }
                            return next;
                          })
                        }
                      />
                    </th>
                    {columns.map((column) => (
                      <th key={column.key} scope="col" className="px-3 py-2.5">
                        <ExcelTableHeader
                          columnKey={column.key}
                          label={column.label}
                          options={table.getValueOptions(column.key)}
                          selectedValues={table.filters[column.key]}
                          sortDirection={
                            table.sort?.key === column.key ? table.sort.direction : undefined
                          }
                          onFilterChange={(values) => table.setColumnFilter(column.key, values)}
                          onSort={(direction) => table.setSort(column.key, direction)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.visibleRows.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        selected.has(row.id)
                          ? 'border-b bg-orange-50'
                          : 'border-b hover:bg-slate-50/60'
                      }
                    >
                      <td className="sticky left-0 bg-white px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${String(row.values.title ?? row.id)}`}
                          checked={selected.has(row.id)}
                          onChange={(event) => changeSelection(row.id, event.target.checked)}
                        />
                      </td>
                      {columns.map((column) => {
                        const value = displayValue(catalogValue(row, column.key), column.key);
                        return (
                          <td key={column.key} className="max-w-64 px-3 py-3 align-top">
                            {column.key === 'title' ? (
                              <button
                                type="button"
                                className="text-left font-semibold text-primary hover:underline"
                                onClick={() => setDetail(row)}
                              >
                                {value}
                              </button>
                            ) : column.key === 'id' ? (
                              <code>{value}</code>
                            ) : column.key === 'status' && value !== '—' ? (
                              <StatusBadge tone={statusTones[value] ?? 'neutral'}>
                                {value}
                              </StatusBadge>
                            ) : (
                              <span className="block truncate" title={value}>
                                {value}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!table.visibleRows.length ? (
              <div className="grid justify-items-center gap-3 px-5 py-10 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-orange-50 text-primary">
                  <FileText className="size-7" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold">
                  {query || table.filteredColumnKeys.length
                    ? 'Sin catálogos para estos filtros'
                    : 'Todavía no hay catálogos'}
                </h3>
                <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                  {query || table.filteredColumnKeys.length
                    ? 'Cambia la búsqueda o quita los filtros para consultar los catálogos disponibles.'
                    : 'Los catálogos reúnen un título, una descripción, el PDF y su vigencia. La carga y los enlaces para compartir todavía no están habilitados.'}
                </p>
                {query || table.filteredColumnKeys.length ? (
                  <Button type="button" size="sm" variant="outline" onClick={removeFilters}>
                    Quitar filtros
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setUploadPreview(true)}
                  >
                    <Plus className="size-3.5" aria-hidden="true" /> Ver formulario de carga
                  </Button>
                )}
              </div>
            ) : null}
            <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
              La consulta de catálogos no genera enlaces públicos ni almacena archivos en este
              navegador.
              {workspace.totalRows > workspace.rows.length
                ? ' La exportación incluye solo las filas cargadas en esta vista.'
                : ''}
            </div>
          </Card>
        </>
      ) : (
        <Card className="grid justify-items-center gap-3 px-5 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-orange-50 text-primary">
            <FileText className="size-7" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">Todavía no hay catálogos</h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Sube el PDF de un catálogo con su título, descripción y vigencia. Después podrás
            compartirlo con un enlace que vence en el plazo que elijas.
          </p>
          <p className="max-w-xl text-xs text-muted-foreground">
            La carga y la compartición todavía no están habilitadas. Puedes consultar el formulario
            previsto; no se guardarán archivos ni se generarán enlaces.
          </p>
          <Button type="button" size="sm" onClick={() => setUploadPreview(true)}>
            <Plus className="size-3.5" aria-hidden="true" /> Ver formulario de carga
          </Button>
        </Card>
      )}
      {uploadPreview ? <UploadPreview onClose={() => setUploadPreview(false)} /> : null}
      {detail ? (
        <WorkspaceDrawer
          title={String(detail.values.title ?? 'Detalle de catálogo')}
          onClose={() => setDetail(null)}
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            {columns.map((column) => (
              <div key={column.key}>
                <dt className="text-xs text-muted-foreground">{column.label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold">
                  {displayValue(catalogValue(detail, column.key), column.key)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 rounded-lg border bg-slate-50 p-3 text-xs text-muted-foreground">
            La apertura del PDF, su mantenimiento y los enlaces para compartir todavía no están
            habilitados.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled>
              Ver PDF
            </Button>
            <Button type="button" size="sm" disabled>
              Compartir
            </Button>
          </div>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}
