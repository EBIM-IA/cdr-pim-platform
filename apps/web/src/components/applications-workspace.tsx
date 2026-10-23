'use client';

import type { GroupApplicationDto, UpdateGroupApplicationInput } from '@cdr/contracts';
import {
  Check,
  Columns3,
  Download,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ExcelTableFilterBar,
  ExcelTableHeader,
  type ExcelTableColumn,
  useExcelTableRows,
} from '@/components/excel-table-filter';
import { usePersistentColumnOrder } from '@/components/column-order';
import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { downloadCsv, downloadXlsx } from '@/lib/tabular-export';
import { Skeleton } from '@/components/ui/skeleton';
import {
  createApplication,
  deactivateApplication,
  listApplications,
  updateApplication,
} from '@/lib/operational-api';

interface ApplicationForm {
  unifiedCode: string;
  vehicleType: '' | 'AUTOMOTRIZ' | 'INDUSTRIAL';
  make: string;
  model: string;
  bodyStyle: string;
  fuel: string;
  traction: string;
  displacement: string;
  yearFrom: string;
  yearTo: string;
  area: string;
  subarea: string;
  engine: string;
  notes: string;
}

const emptyForm: ApplicationForm = {
  unifiedCode: '',
  vehicleType: '',
  make: '',
  model: '',
  bodyStyle: '',
  fuel: '',
  traction: '',
  displacement: '',
  yearFrom: '',
  yearTo: '',
  area: '',
  subarea: '',
  engine: '',
  notes: '',
};

type ApplicationTableColumnKey =
  | 'unifiedCode'
  | 'vehicleType'
  | 'make'
  | 'model'
  | 'bodyStyle'
  | 'fuel'
  | 'traction'
  | 'displacement'
  | 'yearFrom'
  | 'yearTo'
  | 'area'
  | 'subarea'
  | 'engine'
  | 'notes'
  | 'source'
  | 'active';

type EditableApplicationColumn = Exclude<
  ApplicationTableColumnKey,
  'unifiedCode' | 'vehicleType' | 'source' | 'active'
>;

interface EditingApplicationCell {
  readonly applicationId: string;
  readonly column: EditableApplicationColumn;
  readonly draft: string;
}

const applicationTableColumns: readonly ExcelTableColumn<
  GroupApplicationDto,
  ApplicationTableColumnKey
>[] = [
  {
    key: 'unifiedCode',
    label: 'Código Unificador',
    getValue: (application) => application.unifiedCode,
  },
  {
    key: 'make',
    label: 'Marca Vehículo',
    getValue: (application) => application.make,
  },
  {
    key: 'model',
    label: 'Modelo',
    getValue: (application) => application.model,
  },
  { key: 'bodyStyle', label: 'Tipo', getValue: (application) => application.bodyStyle },
  { key: 'fuel', label: 'Combustible', getValue: (application) => application.fuel },
  { key: 'traction', label: 'Tracción', getValue: (application) => application.traction },
  {
    key: 'displacement',
    label: 'Cilindraje',
    getValue: (application) => application.displacement,
  },
  { key: 'yearFrom', label: 'Año desde', getValue: (application) => application.yearFrom },
  { key: 'yearTo', label: 'Año hasta', getValue: (application) => application.yearTo },
  { key: 'area', label: 'Área', getValue: (application) => application.area },
  { key: 'subarea', label: 'Subárea', getValue: (application) => application.subarea },
  { key: 'engine', label: 'Motor', getValue: (application) => application.engine },
  { key: 'notes', label: 'Notas', getValue: (application) => application.notes },
  {
    key: 'vehicleType',
    label: 'Contexto',
    getValue: (application) => application.vehicleType,
  },
  {
    key: 'source',
    label: 'Origen',
    getValue: (application) => (application.source === 'import' ? 'Importación' : 'Manual'),
  },
  {
    key: 'active',
    label: 'Estado',
    getValue: (application) => (application.active ? 'Activo' : 'Inactivo'),
  },
];

const applicationTableColumnKeys = applicationTableColumns.map((column) => column.key);

function year(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

function applicationCellValue(
  application: GroupApplicationDto,
  column: EditableApplicationColumn,
): string {
  const value = application[column];
  return value === null ? '' : String(value);
}

function applicationCellUpdate(
  column: EditableApplicationColumn,
  draft: string,
  expectedUpdatedAt: string,
): UpdateGroupApplicationInput {
  const value = draft.trim();
  if (column === 'make' || column === 'model') {
    if (!value || value === '-') {
      throw new Error(`${column === 'make' ? 'Marca' : 'Modelo'} es obligatorio.`);
    }
    return { expectedUpdatedAt, [column]: value };
  }
  if (column === 'yearFrom' || column === 'yearTo') {
    if (!value || value === '-') return { expectedUpdatedAt, [column]: null };
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1886 || parsed > 2200) {
      throw new Error('El año debe ser un entero entre 1886 y 2200.');
    }
    return { expectedUpdatedAt, [column]: parsed };
  }
  return { expectedUpdatedAt, [column]: value === '-' ? '' : value };
}

export function ApplicationsWorkspace({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<GroupApplicationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingApplicationCell | null>(null);
  const [cellSaving, setCellSaving] = useState(false);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [view, setView] = useState<'context' | 'all'>('all');
  const [selectedCode, setSelectedCode] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('unifiedCode');
    if (params.get('view') === 'context' || code) setView('context');
    if (code) setSelectedCode(code);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listApplications({ includeInactive }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar aplicaciones.',
      );
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return items.filter(
      (item) =>
        !normalized ||
        [
          item.unifiedCode,
          item.vehicleType,
          item.make,
          item.model,
          item.bodyStyle,
          item.fuel,
          item.traction,
          item.displacement,
          item.area,
          item.subarea,
          item.engine,
          item.notes,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('es').includes(normalized)),
    );
  }, [items, query]);

  const unifiedCodes = useMemo(
    () => [...new Set(items.map((item) => item.unifiedCode))].sort(),
    [items],
  );
  const effectiveCode = selectedCode || unifiedCodes[0] || '';
  const contextRows = filtered.filter((item) => item.unifiedCode === effectiveCode);
  const tableRows = view === 'context' ? contextRows : filtered;
  const applicationTable = useExcelTableRows({
    rows: tableRows,
    columns: applicationTableColumns,
    initialSort: { key: 'unifiedCode', direction: 'asc' },
  });
  const applicationColumnOrder = usePersistentColumnOrder({
    screenKey: 'applications',
    columnKeys: applicationTableColumnKeys,
  });
  const orderedApplicationColumns = applicationColumnOrder.orderedColumnKeys.map((key) =>
    applicationTableColumns.find((column) => column.key === key)!,
  );
  const exportRows = applicationTable.visibleRows.map((item) =>
    orderedApplicationColumns.map((column) => column.getValue(item)),
  );
  const downloadTemplate = () => {
    const content =
      'codigo_unificador,marca_vehiculo,modelo,tipo,combustible,traccion,cilindraje,anio_desde,anio_hasta,area,subarea,motor,notas\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plantilla-aplicaciones.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const updateField = <Key extends keyof ApplicationForm>(
    field: Key,
    value: ApplicationForm[Key],
  ) => setForm((current) => ({ ...current, [field]: value }));

  const closeForm = () => {
    setForm(emptyForm);
    setShowForm(false);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (
        !form.unifiedCode.trim() ||
        !form.vehicleType ||
        !form.make.trim() ||
        !form.model.trim()
      ) {
        throw new Error(
          'Código unificador, contexto de aplicación, marca y modelo son obligatorios.',
        );
      }
      const fields = {
        vehicleType: form.vehicleType,
        make: form.make,
        model: form.model,
        bodyStyle: form.bodyStyle,
        fuel: form.fuel,
        traction: form.traction,
        displacement: form.displacement,
        yearFrom: year(form.yearFrom),
        yearTo: year(form.yearTo),
        area: form.area,
        subarea: form.subarea,
        engine: form.engine,
        notes: form.notes,
      };
      const created = await createApplication({ unifiedCode: form.unifiedCode.trim(), ...fields });
      setItems((current) => [created, ...current]);
      setNotice('Aplicación creada para todo el código unificador.');
      closeForm();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar.');
    } finally {
      setSaving(false);
    }
  };

  const saveCell = async (item: GroupApplicationDto) => {
    if (!editingCell || editingCell.applicationId !== item.id) return;
    const current = editingCell;
    const previous = applicationCellValue(item, current.column);
    setEditingCell(null);
    if (current.draft.trim() === previous) return;
    setCellSaving(true);
    setError(null);
    try {
      const updated = await updateApplication(
        item.id,
        applicationCellUpdate(current.column, current.draft, item.updatedAt),
      );
      setNotice('Celda actualizada y registrada en Auditoría.');
      setItems((rows) => rows.map((row) => (row.id === item.id ? updated : row)));
      setEditedCells((cells) => new Set([...cells, `${item.id}:${current.column}`]));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible guardar la celda.',
      );
    } finally {
      setCellSaving(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deactivateSelected = async () => {
    const selected = items.filter((item) => selectedIds.has(item.id) && item.active);
    if (selected.length === 0) return;
    setDeleting(true);
    setError(null);
    const results = await Promise.allSettled(
      selected.map((item) => deactivateApplication(item.id, item.updatedAt)),
    );
    const succeeded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    setItems((rows) =>
      includeInactive
        ? rows.map((row) => succeeded.find((item) => item.id === row.id) ?? row)
        : rows.filter((row) => !succeeded.some((item) => item.id === row.id)),
    );
    setSelectedIds(new Set());
    setNotice(`${succeeded.length} de ${selected.length} aplicaciones fueron desactivadas.`);
    if (succeeded.length !== selected.length) {
      setError(
        'Algunas filas cambiaron en el servidor y no se desactivaron. Actualiza y vuelve a seleccionarlas.',
      );
    }
    setDeleting(false);
  };

  const reactivateSelected = async () => {
    const selected = items.filter((item) => selectedIds.has(item.id) && !item.active);
    if (selected.length === 0) return;
    setRestoring(true);
    setError(null);
    const results = await Promise.allSettled(
      selected.map((item) =>
        updateApplication(item.id, { expectedUpdatedAt: item.updatedAt, active: true }),
      ),
    );
    const succeeded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    setItems((rows) => rows.map((row) => succeeded.find((item) => item.id === row.id) ?? row));
    setSelectedIds(new Set());
    setNotice(`${succeeded.length} de ${selected.length} aplicaciones fueron reactivadas.`);
    if (succeeded.length !== selected.length) {
      setError('Algunas filas cambiaron en el servidor y no se reactivaron. Actualiza la vista.');
    }
    setRestoring(false);
  };

  return (
    <>
      <PageHeader
        eyebrow="Compatibilidad"
        title="Aplicaciones"
        description="Aplicaciones automotrices e industriales compartidas por los SKU de un mismo código unificador."
      />
      <ScreenGuide
        objective="Consulta y mantiene aplicaciones técnicas asociadas al código unificador. Al compartir un código, todos sus SKU heredan las mismas aplicaciones."
        actions={[
          'Busca por código, marca, modelo, tipo, combustible, tracción, cilindraje, área, subárea, motor o notas.',
          'Agrega una fila directamente en la tabla y edita celdas con autoguardado.',
          'Selecciona una o varias filas para desactivarlas sin perder su trazabilidad.',
        ]}
        dataSource="Los registros se leen y escriben en el API de aplicaciones. Cada cambio genera auditoría en el backend."
        limitation="El código unificador debe existir previamente; una aplicación no puede asociarse a un código desconocido."
      />

      <div
        className="sticky top-0 z-20 -mx-1 mb-2 flex flex-wrap items-center gap-1.5 bg-white/95 px-1 py-1.5 backdrop-blur [&_button]:h-[30px] [&_button]:min-h-[30px] [&_button]:text-xs [&_a]:min-h-[30px] [&_a]:text-xs"
        aria-label="Acciones generales de aplicaciones"
      >
        <nav className="mr-2 flex flex-wrap gap-1.5" aria-label="Vistas de aplicaciones">
          <button
            type="button"
            aria-current={view === 'all' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 ${view === 'all' ? 'border-primary bg-orange-50 text-primary shadow-[inset_0_-2px_0_var(--color-primary)]' : 'border-border text-muted-foreground'}`}
            onClick={() => setView('all')}
          >
            Todas las aplicaciones · tabla{' '}
            <span className="rounded-md bg-orange-50 px-2 py-0.5">{items.length}</span>
          </button>
          <button
            type="button"
            aria-current={view === 'context' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 ${view === 'context' ? 'border-primary bg-orange-50 text-primary shadow-[inset_0_-2px_0_var(--color-primary)]' : 'border-border text-muted-foreground'}`}
            onClick={() => setView('context')}
          >
            Código unificador en contexto{' '}
            <span className="rounded-md bg-orange-50 px-2 py-0.5">{contextRows.length}</span>
          </button>
        </nav>
        {canWrite ? (
          <>
            <Button
              size="sm"
              disabled={showForm}
              aria-label="Agregar fila"
              onClick={() => {
                closeForm();
                setForm({ ...emptyForm, unifiedCode: view === 'context' ? effectiveCode : '' });
                setShowForm(true);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" /> Nuevo
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Eliminar selección (${selectedIds.size})`}
              onClick={() => void deactivateSelected()}
              disabled={deleting || selectedIds.size === 0}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {deleting ? 'Eliminando…' : 'Eliminar'}
              {selectedIds.size ? ` (${selectedIds.size})` : ''}
            </Button>
          </>
        ) : null}
        {canWrite ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/imports?view=new&target=applications">
              <Upload className="size-3.5" aria-hidden="true" />
              Importar
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            <Upload className="size-3.5" aria-hidden="true" />
            Importar
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={loading || !exportRows.length}
          onClick={() =>
            downloadXlsx(
              {
                headers: orderedApplicationColumns.map((column) => column.label),
                rows: exportRows,
                sheetName: 'Aplicaciones',
              },
              view === 'context' ? `aplicaciones-${effectiveCode}` : 'aplicaciones-filtradas',
            )
          }
        >
          <Download className="size-3.5" aria-hidden="true" />
          Exportar Excel
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={downloadTemplate}
          title="Descargar plantilla CSV"
        >
          Plantilla
        </Button>
        <label className="ml-auto min-w-40 flex-[1_1_180px] text-xs">
          <span className="sr-only">Buscar aplicaciones</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en la tabla…"
            className="h-[30px] min-h-[30px] bg-slate-50 text-xs"
          />
        </label>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Actualizar aplicaciones"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Restaurar columnas"
          title="Restaurar columnas"
          onClick={applicationColumnOrder.resetOrder}
          disabled={applicationColumnOrder.isDefaultOrder}
        >
          <Columns3 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      {notice ? (
        <div
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : tableRows.length === 0 && !showForm ? (
        <StatePanel
          variant="empty"
          title="Sin aplicaciones"
          description="No hay registros que coincidan con la búsqueda y el estado seleccionados."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2">
            <div className="min-w-0 flex-[1_1_600px]">
              <h2 className="mr-2 inline text-sm font-semibold">
                Aplicaciones · {tableRows.length}
              </h2>
              <p className="inline text-xs text-muted-foreground">
                Una fila por vehículo y código unificador; se comparte con todos los SKU del grupo.{' '}
                {unifiedCodes.length} códigos unificadores con aplicaciones.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span>
                <i className="mr-1 inline-block size-3 rounded-sm border border-red-200 bg-red-50 align-middle" />
                Obligatorio sin valor
              </span>
              <span>
                <i className="mr-1 inline-block size-3 rounded-sm border border-orange-200 align-middle shadow-[inset_2px_0_0_#ff5a00]" />
                Editado en esta sesión
              </span>
            </div>
          </div>
          <ExcelTableFilterBar
            filteredColumns={applicationTable.filteredColumnKeys.map(
              (key) => applicationTableColumns.find((column) => column.key === key)?.label ?? key,
            )}
            sort={
              applicationTable.sort
                ? {
                    label:
                      applicationTableColumns.find(
                        (column) => column.key === applicationTable.sort?.key,
                      )?.label ?? applicationTable.sort.key,
                    direction: applicationTable.sort.direction,
                  }
                : undefined
            }
            visibleCount={applicationTable.visibleRows.length}
            totalCount={tableRows.length}
            onClear={applicationTable.clear}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2250px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      disabled={!canWrite}
                      aria-label="Seleccionar todas las aplicaciones visibles"
                      checked={
                        applicationTable.visibleRows.length > 0 &&
                        applicationTable.visibleRows.every((item) => selectedIds.has(item.id))
                      }
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked
                            ? new Set(applicationTable.visibleRows.map((item) => item.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  {orderedApplicationColumns.map((column) => (
                    <ExcelTableHeader
                      key={column.key}
                      columnKey={column.key}
                      label={column.label}
                      options={applicationTable.getValueOptions(column.key)}
                      selectedValues={applicationTable.filters[column.key]}
                      sortDirection={
                        applicationTable.sort?.key === column.key
                          ? applicationTable.sort.direction
                          : undefined
                      }
                      onFilterChange={(values) =>
                        applicationTable.setColumnFilter(column.key, values)
                      }
                      onSort={(direction) => applicationTable.setSort(column.key, direction)}
                      reorder={applicationColumnOrder.getColumnControl(column.key, column.label)}
                    />
                  ))}
                  <th className="px-4 py-3">Guardado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {showForm ? (
                  <NewApplicationRow
                    columns={applicationColumnOrder.orderedColumnKeys}
                    form={form}
                    saving={saving}
                    onField={updateField}
                    onSave={() => void submit()}
                    onCancel={closeForm}
                  />
                ) : null}
                {applicationTable.visibleRows.map((item) => (
                  <tr
                    key={item.id}
                    className={selectedIds.has(item.id) ? 'bg-orange-50' : 'hover:bg-orange-50/40'}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        disabled={!canWrite}
                        aria-label={`Seleccionar aplicación ${item.make} ${item.model}`}
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                      />
                    </td>
                    {applicationColumnOrder.orderedColumnKeys.map((column) => (
                      <ApplicationDataCell
                        key={column}
                        item={item}
                        column={column}
                        canWrite={canWrite}
                        edited={editedCells.has(`${item.id}:${column}`)}
                        editingCell={editingCell}
                        saving={cellSaving}
                        onStart={(editableColumn) =>
                          setEditingCell({
                            applicationId: item.id,
                            column: editableColumn,
                            draft: applicationCellValue(item, editableColumn),
                          })
                        }
                        onDraft={(editableColumn, draft) =>
                          setEditingCell({
                            applicationId: item.id,
                            column: editableColumn,
                            draft,
                          })
                        }
                        onSave={() => void saveCell(item)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ))}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {cellSaving ? 'Guardando…' : 'Al día'}
                      </span>
                    </td>
                  </tr>
                ))}
                {applicationTable.visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={applicationTableColumns.length + 2}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Ninguna fila cumple los filtros de columna combinados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="border-t px-3.5 py-2 text-[11px] text-muted-foreground">
            {canWrite
              ? 'Clic en una celda o empieza a escribir para editar · se guarda al salir de la celda (Tab, Enter o clic fuera) · Esc cancela · * obligatorio.'
              : 'Acceso de consulta: puedes filtrar, ordenar y exportar las aplicaciones.'}
          </p>
        </Card>
      )}
      {view === 'context' ? (
        <Card className="mt-3 grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold">Aplicaciones heredadas</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Los SKU de un mismo código unificador comparten sus aplicaciones. Cada registro
              conserva su información y trazabilidad.
            </p>
          </div>
          <Select
            label="Código unificador"
            value={effectiveCode}
            onChange={(event) => setSelectedCode(event.target.value)}
          >
            {unifiedCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Card>
      ) : null}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Más opciones</summary>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
            Mostrar inactivos
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!exportRows.length}
            onClick={() =>
              downloadCsv(
                {
                  headers: orderedApplicationColumns.map((column) => column.label),
                  rows: exportRows,
                },
                'aplicaciones-filtradas',
              )
            }
          >
            Exportar CSV
          </Button>
          {includeInactive && canWrite ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void reactivateSelected()}
              disabled={restoring || !selectedIds.size}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reactivar selección
            </Button>
          ) : null}
        </div>
      </details>
    </>
  );
}

function NewApplicationRow({
  columns,
  form,
  saving,
  onField,
  onSave,
  onCancel,
}: {
  columns: readonly ApplicationTableColumnKey[];
  form: ApplicationForm;
  saving: boolean;
  onField: <Key extends keyof ApplicationForm>(field: Key, value: ApplicationForm[Key]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <tr className="bg-orange-50/50">
      <td className="px-4 py-2" />
      {columns.map((column, index) => (
        <NewApplicationCell
          key={column}
          column={column}
          form={form}
          autoFocus={index === 0}
          onField={onField}
        />
      ))}
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            aria-label="Guardar nueva aplicación"
            onClick={onSave}
            disabled={saving}
          >
            <Check className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cancelar nueva aplicación"
            onClick={onCancel}
            disabled={saving}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function NewApplicationCell({
  column,
  form,
  autoFocus,
  onField,
}: {
  column: ApplicationTableColumnKey;
  form: ApplicationForm;
  autoFocus: boolean;
  onField: <Key extends keyof ApplicationForm>(field: Key, value: ApplicationForm[Key]) => void;
}) {
  if (column === 'source') return <td className="px-4 py-2">Manual</td>;
  if (column === 'active') return <td className="px-4 py-2">Activo</td>;
  if (column === 'vehicleType') {
    return (
      <td className="px-2 py-2">
        <select
          autoFocus={autoFocus}
          aria-label="Nuevo contexto de aplicación"
          value={form.vehicleType}
          onChange={(event) =>
            onField('vehicleType', event.target.value as ApplicationForm['vehicleType'])
          }
          className="h-10 min-w-36 rounded-md border bg-white px-2 text-sm"
        >
          <option value="">Selecciona</option>
          <option value="AUTOMOTRIZ">Automotriz</option>
          <option value="INDUSTRIAL">Industrial</option>
        </select>
      </td>
    );
  }

  const field = column as keyof ApplicationForm;
  const labels: Record<
    Exclude<ApplicationTableColumnKey, 'source' | 'active' | 'vehicleType'>,
    string
  > = {
    unifiedCode: 'Nuevo código unificador de aplicación',
    make: 'Nueva marca de aplicación',
    model: 'Nuevo modelo de aplicación',
    bodyStyle: 'Nuevo tipo de carrocería',
    fuel: 'Nuevo combustible',
    traction: 'Nueva tracción',
    displacement: 'Nuevo cilindraje',
    yearFrom: 'Nuevo año desde',
    yearTo: 'Nuevo año hasta',
    area: 'Nueva área',
    subarea: 'Nueva subárea',
    engine: 'Nuevo motor',
    notes: 'Nuevas notas',
  };
  const yearField = column === 'yearFrom' || column === 'yearTo';
  return (
    <td className="px-2 py-2">
      <Input
        autoFocus={autoFocus}
        aria-label={labels[column]}
        type={yearField ? 'number' : 'text'}
        min={yearField ? 1886 : undefined}
        max={yearField ? 2200 : undefined}
        maxLength={
          ['bodyStyle', 'fuel', 'traction', 'displacement', 'area', 'subarea'].includes(column)
            ? 200
            : undefined
        }
        value={String(form[field])}
        onChange={(event) => onField(field, event.target.value as never)}
      />
    </td>
  );
}

function ApplicationDataCell({
  item,
  column,
  canWrite,
  edited,
  editingCell,
  saving,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  item: GroupApplicationDto;
  column: ApplicationTableColumnKey;
  canWrite: boolean;
  edited: boolean;
  editingCell: EditingApplicationCell | null;
  saving: boolean;
  onStart: (column: EditableApplicationColumn) => void;
  onDraft: (column: EditableApplicationColumn, draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (column === 'unifiedCode') {
    return <td className="px-4 py-3 font-semibold">{item.unifiedCode}</td>;
  }
  if (column === 'vehicleType') return <td className="px-4 py-3">{item.vehicleType ?? '—'}</td>;
  if (column === 'source') {
    return <td className="px-4 py-3">{item.source === 'import' ? 'Importación' : 'Manual'}</td>;
  }
  if (column === 'active') {
    return (
      <td className="px-4 py-3">
        <StatusBadge tone={item.active ? 'success' : 'neutral'}>
          {item.active ? 'Activo' : 'Inactivo'}
        </StatusBadge>
      </td>
    );
  }
  return (
    <InlineApplicationCell
      item={item}
      column={column}
      canWrite={canWrite && item.active}
      edited={edited}
      editing={
        editingCell?.applicationId === item.id && editingCell.column === column ? editingCell : null
      }
      saving={saving}
      onStart={() => onStart(column)}
      onDraft={(draft) => onDraft(column, draft)}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function InlineApplicationCell({
  item,
  column,
  canWrite,
  edited,
  editing,
  saving,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  item: GroupApplicationDto;
  column: EditableApplicationColumn;
  canWrite: boolean;
  edited: boolean;
  editing: EditingApplicationCell | null;
  saving: boolean;
  onStart: () => void;
  onDraft: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const label =
    applicationTableColumns.find((candidate) => candidate.key === column)?.label ?? column;
  const displayed = applicationCellValue(item, column) || '—';
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  if (!editing) {
    return (
      <td className={`max-w-64 px-4 py-3 ${edited ? 'shadow-[inset_2px_0_0_#ff5a00]' : ''}`}>
        {canWrite ? (
          <button
            type="button"
            className="min-h-8 w-full rounded px-2 text-left hover:bg-white hover:ring-1 hover:ring-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
            onClick={onStart}
            aria-label={`Editar ${label} de ${item.unifiedCode}`}
            title="Haz clic para editar esta celda"
          >
            <span className={displayed === '—' ? 'text-muted-foreground' : undefined}>
              {displayed}
            </span>
          </button>
        ) : (
          displayed
        )}
      </td>
    );
  }

  return (
    <td className="px-2 py-2">
      <div className="flex min-w-44 items-center gap-1">
        <input
          autoFocus
          value={editing.draft}
          disabled={saving}
          type={column === 'yearFrom' || column === 'yearTo' ? 'number' : 'text'}
          min={column === 'yearFrom' || column === 'yearTo' ? 1886 : undefined}
          max={column === 'yearFrom' || column === 'yearTo' ? 2200 : undefined}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onSave}
          onKeyDown={onKeyDown}
          aria-label={`Editar ${label}`}
          maxLength={column === 'notes' ? 2_000 : 200}
          className="h-9 min-w-36 rounded-md border bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
        />
        {saving ? <span className="text-xs text-muted-foreground">Guardando…</span> : null}
      </div>
    </td>
  );
}
