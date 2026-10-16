'use client';

import type { GroupApplicationDto, UpdateGroupApplicationInput } from '@cdr/contracts';
import {
  CarFront,
  Check,
  Download,
  Layers3,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
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
import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { TableExportButtons } from '@/components/table-export-buttons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
  yearFrom: string;
  yearTo: string;
  engine: string;
  notes: string;
}

const emptyForm: ApplicationForm = {
  unifiedCode: '',
  vehicleType: '',
  make: '',
  model: '',
  yearFrom: '',
  yearTo: '',
  engine: '',
  notes: '',
};

type ApplicationTableColumnKey =
  | 'unifiedCode'
  | 'vehicleType'
  | 'make'
  | 'model'
  | 'yearFrom'
  | 'yearTo'
  | 'engine'
  | 'notes'
  | 'source'
  | 'active';

type EditableApplicationColumn = Exclude<
  ApplicationTableColumnKey,
  'unifiedCode' | 'source' | 'active'
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
    label: 'Código',
    getValue: (application) => application.unifiedCode,
  },
  {
    key: 'vehicleType',
    label: 'Vehículo',
    getValue: (application) => application.vehicleType,
  },
  {
    key: 'make',
    label: 'Marca',
    getValue: (application) => application.make,
  },
  {
    key: 'model',
    label: 'Modelo',
    getValue: (application) => application.model,
  },
  { key: 'yearFrom', label: 'Año desde', getValue: (application) => application.yearFrom },
  { key: 'yearTo', label: 'Año hasta', getValue: (application) => application.yearTo },
  { key: 'engine', label: 'Motor', getValue: (application) => application.engine },
  { key: 'notes', label: 'Notas', getValue: (application) => application.notes },
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

const editableApplicationColumns: readonly EditableApplicationColumn[] = [
  'vehicleType',
  'make',
  'model',
  'yearFrom',
  'yearTo',
  'engine',
  'notes',
];

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
  if (column === 'vehicleType') {
    const normalized = value.toUpperCase();
    if (normalized !== 'AUTOMOTRIZ' && normalized !== 'INDUSTRIAL') {
      throw new Error('El tipo debe ser Automotriz o Industrial.');
    }
    return { expectedUpdatedAt, vehicleType: normalized };
  }
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
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [makeFilter, setMakeFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingApplicationCell | null>(null);
  const [cellSaving, setCellSaving] = useState(false);
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [view, setView] = useState<'context' | 'all'>('context');
  const [selectedCode, setSelectedCode] = useState('');

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
        (!normalized ||
          [item.unifiedCode, item.vehicleType, item.make, item.model, item.engine, item.notes]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase('es').includes(normalized))) &&
        (!vehicleTypeFilter || item.vehicleType === vehicleTypeFilter) &&
        (!makeFilter || item.make === makeFilter),
    );
  }, [items, makeFilter, query, vehicleTypeFilter]);

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
  const exportRows = applicationTable.visibleRows.map((item) => [
    item.unifiedCode,
    item.vehicleType,
    item.make,
    item.model,
    item.yearFrom,
    item.yearTo,
    item.engine,
    item.notes,
    item.source === 'import' ? 'Importación' : 'Manual',
    item.active ? 'Activo' : 'Inactivo',
  ]);
  const vehicleTypes = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((item) => item.vehicleType)
            .filter((value): value is NonNullable<GroupApplicationDto['vehicleType']> =>
              Boolean(value),
            ),
        ),
      ].sort(),
    [items],
  );
  const makes = useMemo(
    () =>
      [
        ...new Set(
          items.map((item) => item.make).filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [items],
  );

  const downloadTemplate = () => {
    const content =
      'codigo_unificador,tipo_vehiculo,marca,modelo,anio_desde,anio_hasta,motor,notas\n';
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
      if (!form.vehicleType || !form.make.trim() || !form.model.trim()) {
        throw new Error('Tipo de aplicación, marca y modelo son obligatorios.');
      }
      const fields = {
        vehicleType: form.vehicleType,
        make: form.make,
        model: form.model,
        yearFrom: year(form.yearFrom),
        yearTo: year(form.yearTo),
        engine: form.engine,
        notes: form.notes,
      };
      const created = await createApplication({ unifiedCode: form.unifiedCode, ...fields });
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
          'Busca por código, marca, modelo, motor o notas.',
          'Agrega una fila directamente en la tabla y edita celdas con autoguardado.',
          'Selecciona una o varias filas para desactivarlas sin perder su trazabilidad.',
        ]}
        dataSource="Los registros se leen y escriben en el API de aplicaciones. Cada cambio genera auditoría en el backend."
        limitation="El código unificador debe existir previamente; una aplicación no puede asociarse a un código desconocido."
      />

      <div
        className="sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap items-center gap-2 border-y bg-cdr-canvas/95 px-1 py-2 backdrop-blur"
        aria-label="Acciones generales de aplicaciones"
      >
        <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw aria-hidden="true" className={loading ? 'size-4 animate-spin' : 'size-4'} />
          Actualizar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={downloadTemplate}>
          <Download aria-hidden="true" className="size-4" /> Plantilla CSV
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/imports">
            <Upload aria-hidden="true" className="size-4" /> Importar
          </Link>
        </Button>
        <TableExportButtons
          filename={
            view === 'context'
              ? `aplicaciones-${effectiveCode || 'sin-codigo'}`
              : 'aplicaciones-filtradas'
          }
          sheetName="Aplicaciones"
          headers={[
            'Código unificador',
            'Tipo de vehículo',
            'Marca',
            'Modelo',
            'Año desde',
            'Año hasta',
            'Motor',
            'Notas',
            'Origen',
            'Estado',
          ]}
          rows={exportRows}
          disabled={loading}
        />
        {canWrite ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={showForm}
              onClick={() => {
                closeForm();
                setForm({ ...emptyForm, unifiedCode: effectiveCode });
                setShowForm(true);
              }}
            >
              <Plus aria-hidden="true" className="size-4" /> Agregar fila
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void deactivateSelected()}
              disabled={deleting || selectedIds.size === 0}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {deleting ? 'Eliminando…' : `Eliminar selección (${selectedIds.size})`}
            </Button>
            {includeInactive ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void reactivateSelected()}
                disabled={restoring || selectedIds.size === 0}
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                {restoring ? 'Reactivando…' : 'Reactivar selección'}
              </Button>
            ) : null}
          </>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {selectedIds.size} seleccionados
        </span>
      </div>

      <nav className="mb-5 grid gap-3 sm:grid-cols-2" aria-label="Vistas de aplicaciones">
        <button
          type="button"
          className={`rounded-xl border p-4 text-left ${view === 'context' ? 'border-primary bg-orange-50/50 ring-1 ring-primary' : 'bg-white'}`}
          onClick={() => setView('context')}
        >
          <strong className="text-sm">Código unificador en contexto</strong>
          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-primary">
            {contextRows.length}
          </span>
          <small className="mt-1 block text-muted-foreground">
            Aplicaciones heredadas por todos los SKU del grupo
          </small>
        </button>
        <button
          type="button"
          className={`rounded-xl border p-4 text-left ${view === 'all' ? 'border-primary bg-orange-50/50 ring-1 ring-primary' : 'bg-white'}`}
          onClick={() => setView('all')}
        >
          <strong className="text-sm">Todas las aplicaciones</strong>
          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-primary">
            {items.length}
          </span>
          <small className="mt-1 block text-muted-foreground">
            Vista de catálogo y mantenimiento masivo
          </small>
        </button>
      </nav>

      {view === 'context' ? (
        <Card className="mb-5 overflow-hidden">
          <div className="grid gap-5 border-b bg-slate-50/70 p-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,2fr)] lg:items-end">
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
            <div className="flex flex-wrap gap-3">
              <div className="min-w-40 rounded-xl border bg-white p-4">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers3 className="size-4 text-primary" /> Aplicaciones heredadas
                </span>
                <strong className="mt-1 block text-2xl">{contextRows.length}</strong>
              </div>
              <div className="min-w-40 rounded-xl border bg-white p-4">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CarFront className="size-4 text-primary" /> Marcas / industrias
                </span>
                <strong className="mt-1 block text-2xl">
                  {new Set(contextRows.map((item) => item.make).filter(Boolean)).size}
                </strong>
              </div>
              <div className="min-w-48 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-950">
                <strong className="block">Regla de herencia vigente</strong>
                <span className="mt-1 block leading-relaxed opacity-75">
                  El backend persiste la aplicación en el grupo; no duplica registros por SKU.
                </span>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {view === 'all' ? (
        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen">
          {[
            ['Aplicaciones', items.length, 'registradas'],
            ['Códigos unificadores', unifiedCodes.length, 'grupos con aplicaciones'],
            ['Marcas / industrias', makes.length, 'valores registrados'],
            ['Inactivas', items.filter((item) => !item.active).length, 'con historial'],
          ].map(([label, value, note]) => (
            <Card key={label} className="min-h-28 p-5">
              <small className="text-muted-foreground">{label}</small>
              <strong className="mt-1 block text-2xl">{value}</strong>
              <span className="text-[10px] text-muted-foreground">{note}</span>
            </Card>
          ))}
        </section>
      ) : null}

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

      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_220px_auto_auto] xl:items-end">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Buscar aplicaciones
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <Input
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Código, marca, modelo o motor"
              />
            </span>
          </label>
          <Select
            label="Tipo"
            value={vehicleTypeFilter}
            onChange={(event) => setVehicleTypeFilter(event.target.value)}
          >
            <option value="">Todos</option>
            {vehicleTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            label="Marca / industria"
            value={makeFilter}
            onChange={(event) => setMakeFilter(event.target.value)}
          >
            <option value="">Todas</option>
            {makes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <label className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />{' '}
            Mostrar inactivos
          </label>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw aria-hidden="true" className={loading ? 'size-4 animate-spin' : 'size-4'} />
            Actualizar
          </Button>
        </div>
      </Card>

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
            <table className="w-full min-w-[1750px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
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
                  {applicationTableColumns.map((column) => (
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
                    />
                  ))}
                  <th className="px-4 py-3">Guardado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {showForm ? (
                  <NewApplicationRow
                    form={form}
                    saving={saving}
                    onField={updateField}
                    onSave={() => void submit()}
                    onCancel={closeForm}
                  />
                ) : null}
                {applicationTable.visibleRows.map((item) => (
                  <tr key={item.id} className="hover:bg-orange-50/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar aplicación ${item.make} ${item.model}`}
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold">{item.unifiedCode}</td>
                    {editableApplicationColumns.map((column) => (
                      <InlineApplicationCell
                        key={column}
                        item={item}
                        column={column}
                        canWrite={canWrite && item.active}
                        editing={
                          editingCell?.applicationId === item.id && editingCell.column === column
                            ? editingCell
                            : null
                        }
                        saving={cellSaving}
                        onStart={() =>
                          setEditingCell({
                            applicationId: item.id,
                            column,
                            draft: applicationCellValue(item, column),
                          })
                        }
                        onDraft={(draft) =>
                          setEditingCell({ applicationId: item.id, column, draft })
                        }
                        onSave={() => void saveCell(item)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ))}
                    <td className="px-4 py-3">
                      {item.source === 'import' ? 'Importación' : 'Manual'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={item.active ? 'success' : 'neutral'}>
                        {item.active ? 'Activo' : 'Inactivo'}
                      </StatusBadge>
                    </td>
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
                      colSpan={12}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Ninguna fila cumple los filtros de columna combinados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function NewApplicationRow({
  form,
  saving,
  onField,
  onSave,
  onCancel,
}: {
  form: ApplicationForm;
  saving: boolean;
  onField: <Key extends keyof ApplicationForm>(field: Key, value: ApplicationForm[Key]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <tr className="bg-orange-50/50">
      <td className="px-4 py-2" />
      <td className="px-2 py-2">
        <Input
          autoFocus
          aria-label="Nuevo código unificador de aplicación"
          value={form.unifiedCode}
          onChange={(event) => onField('unifiedCode', event.target.value)}
        />
      </td>
      <td className="px-2 py-2">
        <select
          aria-label="Nuevo tipo de aplicación"
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
      <td className="px-2 py-2">
        <Input
          aria-label="Nueva marca de aplicación"
          value={form.make}
          onChange={(event) => onField('make', event.target.value)}
        />
      </td>
      <td className="px-2 py-2">
        <Input
          aria-label="Nuevo modelo de aplicación"
          value={form.model}
          onChange={(event) => onField('model', event.target.value)}
        />
      </td>
      <td className="px-2 py-2">
        <Input
          aria-label="Nuevo año desde"
          type="number"
          min={1886}
          max={2200}
          value={form.yearFrom}
          onChange={(event) => onField('yearFrom', event.target.value)}
        />
      </td>
      <td className="px-2 py-2">
        <Input
          aria-label="Nuevo año hasta"
          type="number"
          min={1886}
          max={2200}
          value={form.yearTo}
          onChange={(event) => onField('yearTo', event.target.value)}
        />
      </td>
      <td className="px-2 py-2">
        <Input
          aria-label="Nuevo motor"
          value={form.engine}
          onChange={(event) => onField('engine', event.target.value)}
        />
      </td>
      <td className="px-2 py-2">
        <Input
          aria-label="Nuevas notas"
          value={form.notes}
          onChange={(event) => onField('notes', event.target.value)}
        />
      </td>
      <td className="px-4 py-2">Manual</td>
      <td className="px-4 py-2">Activo</td>
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

function InlineApplicationCell({
  item,
  column,
  canWrite,
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
      <td className="max-w-64 px-4 py-3">
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
        {column === 'vehicleType' ? (
          <select
            autoFocus
            value={editing.draft}
            disabled={saving}
            onChange={(event) => onDraft(event.target.value)}
            onBlur={onSave}
            onKeyDown={onKeyDown}
            aria-label={`Editar ${label}`}
            className="h-9 min-w-36 rounded-md border bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
          >
            <option value="AUTOMOTRIZ">Automotriz</option>
            <option value="INDUSTRIAL">Industrial</option>
          </select>
        ) : (
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
            className="h-9 min-w-36 rounded-md border bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
          />
        )}
        {saving ? <span className="text-xs text-muted-foreground">Guardando…</span> : null}
      </div>
    </td>
  );
}
