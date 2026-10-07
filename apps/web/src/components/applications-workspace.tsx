'use client';

import type { GroupApplicationDto, UpdateGroupApplicationInput } from '@cdr/contracts';
import {
  CarFront,
  Download,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

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

function fromApplication(value: GroupApplicationDto): ApplicationForm {
  return {
    unifiedCode: value.unifiedCode,
    vehicleType: value.vehicleType ?? '',
    make: value.make ?? '',
    model: value.model ?? '',
    yearFrom: value.yearFrom?.toString() ?? '',
    yearTo: value.yearTo?.toString() ?? '',
    engine: value.engine ?? '',
    notes: value.notes ?? '',
  };
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingApplicationCell | null>(null);
  const [cellSaving, setCellSaving] = useState(false);
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
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
    setEditingId(null);
    setEditingUpdatedAt(null);
    setShowForm(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
      if (editingId) {
        if (!editingUpdatedAt) throw new Error('La versión de la aplicación no está disponible.');
        await updateApplication(editingId, { expectedUpdatedAt: editingUpdatedAt, ...fields });
        setNotice('Aplicación actualizada y auditada correctamente.');
      } else {
        await createApplication({ unifiedCode: form.unifiedCode, ...fields });
        setNotice('Aplicación creada para todo el código unificador.');
      }
      closeForm();
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar.');
    } finally {
      setSaving(false);
    }
  };

  const saveCell = async (item: GroupApplicationDto) => {
    if (!editingCell || editingCell.applicationId !== item.id) return;
    setCellSaving(true);
    setError(null);
    try {
      await updateApplication(
        item.id,
        applicationCellUpdate(editingCell.column, editingCell.draft, item.updatedAt),
      );
      setNotice('Celda actualizada y registrada en Auditoría.');
      setEditingCell(null);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible guardar la celda.',
      );
    } finally {
      setCellSaving(false);
    }
  };

  const setActive = async (item: GroupApplicationDto, active: boolean) => {
    setError(null);
    try {
      if (active) {
        await updateApplication(item.id, { expectedUpdatedAt: item.updatedAt, active: true });
      } else {
        await deactivateApplication(item.id, item.updatedAt);
      }
      setNotice(
        active ? 'Aplicación reactivada.' : 'Aplicación desactivada sin perder su historial.',
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible cambiar el estado.',
      );
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Compatibilidad"
        title="Aplicaciones"
        description="Aplicaciones automotrices e industriales compartidas por los SKU de un mismo código unificador."
        actions={
          <>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download aria-hidden="true" className="size-4" /> Plantilla CSV
            </Button>
            <Button variant="outline" asChild>
              <Link href="/imports">
                <Upload aria-hidden="true" className="size-4" /> Carga masiva
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
              <Button
                onClick={() => {
                  closeForm();
                  setForm({ ...emptyForm, unifiedCode: effectiveCode });
                  setShowForm(true);
                }}
              >
                <Plus aria-hidden="true" className="size-4" /> Nueva aplicación
              </Button>
            ) : null}
          </>
        }
      />
      <ScreenGuide
        objective="Consulta y mantiene aplicaciones técnicas asociadas al código unificador. Al compartir un código, todos sus SKU heredan las mismas aplicaciones."
        actions={[
          'Busca por código, marca, modelo, motor o notas.',
          'Edita una celda en la tabla o abre el formulario completo si tu rol permite escritura.',
          'Desactiva registros sin eliminar su trazabilidad y vuelve a activarlos cuando corresponda.',
        ]}
        dataSource="Los registros se leen y escriben en el API de aplicaciones. Cada cambio genera auditoría en el backend."
        limitation="El código unificador debe existir previamente; una aplicación no puede asociarse a un código desconocido."
      />

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

      {showForm ? (
        <Card className="mb-5 p-5">
          <form onSubmit={submit}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {editingId ? 'Editar aplicación' : 'Nueva aplicación'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Tipo, marca y modelo son obligatorios; motor, años y notas son opcionales.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeForm}
                aria-label="Cerrar formulario"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Código unificador
                <Input
                  required
                  value={form.unifiedCode}
                  disabled={Boolean(editingId)}
                  onChange={(e) => updateField('unifiedCode', e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Tipo de aplicación
                <select
                  required
                  className="h-10 rounded-md border bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
                  value={form.vehicleType}
                  onChange={(event) =>
                    updateField('vehicleType', event.target.value as ApplicationForm['vehicleType'])
                  }
                >
                  <option value="">Selecciona un tipo</option>
                  <option value="AUTOMOTRIZ">Automotriz</option>
                  <option value="INDUSTRIAL">Industrial</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Marca
                <Input
                  required
                  value={form.make}
                  onChange={(e) => updateField('make', e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Modelo
                <Input
                  required
                  value={form.model}
                  onChange={(e) => updateField('model', e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Año desde
                <Input
                  type="number"
                  min={1886}
                  max={2200}
                  value={form.yearFrom}
                  onChange={(e) => updateField('yearFrom', e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Año hasta
                <Input
                  type="number"
                  min={1886}
                  max={2200}
                  value={form.yearTo}
                  onChange={(e) => updateField('yearTo', e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Motor
                <Input
                  value={form.engine}
                  onChange={(e) => updateField('engine', e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Notas
                <Input value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Card>
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
      ) : tableRows.length === 0 ? (
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
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {applicationTable.visibleRows.map((item) => (
                  <tr key={item.id} className="hover:bg-orange-50/40">
                    <td className="px-4 py-3 font-semibold">{item.unifiedCode}</td>
                    {editableApplicationColumns.map((column) => (
                      <InlineApplicationCell
                        key={column}
                        item={item}
                        column={column}
                        canWrite={canWrite}
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
                      <div className="flex justify-end gap-1">
                        {canWrite ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(item.id);
                                setEditingUpdatedAt(item.updatedAt);
                                setForm(fromApplication(item));
                                setShowForm(true);
                              }}
                            >
                              <Pencil aria-hidden="true" className="size-4" />
                              Editar
                            </Button>
                            {item.active ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void setActive(item, false)}
                              >
                                <Trash2 aria-hidden="true" className="size-4" />
                                Desactivar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void setActive(item, true)}
                              >
                                <RotateCcw aria-hidden="true" className="size-4" />
                                Reactivar
                              </Button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Solo lectura</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {applicationTable.visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
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
      onSave();
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
            onKeyDown={onKeyDown}
            aria-label={`Editar ${label}`}
            className="h-9 min-w-36 rounded-md border bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
          />
        )}
        <Button type="button" size="sm" disabled={saving} onClick={onSave}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </td>
  );
}
