'use client';

import type {
  ExternalHomologDto,
  HomologApprovalStatus,
  HomologSearchResultDto,
  UpdateExternalHomologInput,
  WorkspaceRow,
} from '@cdr/contracts';
import {
  Check,
  Columns3,
  Link2,
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
import { usePersistentColumnOrder } from '@/components/column-order';
import { OemCodesWorkspace } from '@/components/oem-codes-workspace';
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
import { useWorkspaceData } from '@/components/use-workspace-data';
import {
  createHomolog,
  deactivateHomolog,
  listHomologs,
  searchEligibleHomologs,
  updateHomolog,
} from '@/lib/operational-api';
import type { TabularData } from '@/lib/tabular-export';
import { formatWorkspaceCell } from '@/lib/workspace-view';

type RelationsView = 'groups' | 'homologs' | 'oem';
type HomologColumn =
  'unifiedCode' | 'externalCode' | 'externalBrand' | 'approvalStatus' | 'source' | 'active';
type EditableHomologColumn = 'externalCode' | 'externalBrand' | 'approvalStatus';

interface HomologDraft {
  unifiedCode: string;
  externalCode: string;
  externalBrand: string;
  approvalStatus: HomologApprovalStatus;
}

interface EditingHomologCell {
  id: string;
  column: EditableHomologColumn;
  draft: string;
}

const emptyDraft: HomologDraft = {
  unifiedCode: '',
  externalCode: '',
  externalBrand: '',
  approvalStatus: 'pending',
};

const approvalLabels: Record<HomologApprovalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const homologColumns: readonly ExcelTableColumn<ExternalHomologDto, HomologColumn>[] = [
  { key: 'unifiedCode', label: 'Código unificador', getValue: (row) => row.unifiedCode },
  { key: 'externalCode', label: 'Código externo', getValue: (row) => row.externalCode },
  { key: 'externalBrand', label: 'Marca', getValue: (row) => row.externalBrand },
  {
    key: 'approvalStatus',
    label: 'Aprobación',
    getValue: (row) => approvalLabels[row.approvalStatus],
  },
  {
    key: 'source',
    label: 'Origen',
    getValue: (row) => (row.source === 'import' ? 'Importación' : 'Manual'),
  },
  { key: 'active', label: 'Estado', getValue: (row) => (row.active ? 'Activo' : 'Inactivo') },
];

const homologColumnKeys = homologColumns.map((column) => column.key);

function homologUpdate(
  row: ExternalHomologDto,
  column: EditableHomologColumn,
  draft: string,
): UpdateExternalHomologInput {
  const value = draft.trim();
  if (!value) throw new Error('El valor no puede quedar vacío.');
  if (column === 'approvalStatus') {
    if (value !== 'pending' && value !== 'approved' && value !== 'rejected') {
      throw new Error('El estado de aprobación no es válido.');
    }
    return { expectedUpdatedAt: row.updatedAt, approvalStatus: value };
  }
  return { expectedUpdatedAt: row.updatedAt, [column]: value };
}

export function EquivalencesWorkspace({ canWrite }: { canWrite: boolean }) {
  const groups = useWorkspaceData('equivalences');
  const [view, setView] = useState<RelationsView>('groups');
  const [items, setItems] = useState<ExternalHomologDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedHomologIds, setSelectedHomologIds] = useState<Set<string>>(new Set());
  const [newRow, setNewRow] = useState(false);
  const [newDraft, setNewDraft] = useState<HomologDraft>(emptyDraft);
  const [editingCell, setEditingCell] = useState<EditingHomologCell | null>(null);
  const [cellState, setCellState] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [savingNew, setSavingNew] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [eligibleQuery, setEligibleQuery] = useState('');
  const [eligibleResults, setEligibleResults] = useState<HomologSearchResultDto[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [oemCount, setOemCount] = useState<number | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get('view');
    if (requested === 'homologs' || requested === 'oem') setView(requested);
    if (requested === 'identifiers') {
      setView('groups');
      url.searchParams.delete('view');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  }, []);

  const changeView = (next: RelationsView) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === 'groups') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listHomologs({ includeInactive }));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible cargar homólogos.',
      );
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => void load(), [load]);

  const groupRows = groups.workspace?.rows ?? [];
  const filteredGroups = useMemo(() => {
    const normalized = groupQuery.trim().toLocaleLowerCase('es');
    if (!normalized) return groupRows;
    return groupRows.filter((row) =>
      Object.values(row.values).some((value) =>
        String(value ?? '')
          .toLocaleLowerCase('es')
          .includes(normalized),
      ),
    );
  }, [groupQuery, groupRows]);
  const groupColumns = useMemo<readonly ExcelTableColumn<WorkspaceRow, string>[]>(
    () =>
      (groups.workspace?.columns ?? []).map((column) => ({
        key: column.key,
        label: column.label,
        getValue: (row) => row.values[column.key],
      })),
    [groups.workspace?.columns],
  );
  const groupTable = useExcelTableRows({
    rows: filteredGroups,
    columns: groupColumns,
    initialSort: groups.workspace?.columns[0]
      ? { key: groups.workspace.columns[0].key, direction: 'asc' }
      : undefined,
  });
  const groupColumnKeys = useMemo(
    () => groups.workspace?.columns.map((column) => column.key) ?? [],
    [groups.workspace?.columns],
  );
  const groupColumnOrder = usePersistentColumnOrder({
    screenKey: 'equivalences-groups',
    columnKeys: groupColumnKeys,
  });
  const orderedGroupColumns = groupColumnOrder.orderedColumnKeys.flatMap((key) => {
    const column = groups.workspace?.columns.find((candidate) => candidate.key === key);
    return column ? [column] : [];
  });

  const filteredHomologs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    if (!normalized) return items;
    return items.filter((row) =>
      [row.unifiedCode, row.externalCode, row.externalBrand, row.approvalStatus].some((value) =>
        value.toLocaleLowerCase('es').includes(normalized),
      ),
    );
  }, [items, query]);
  const homologTable = useExcelTableRows({
    rows: filteredHomologs,
    columns: homologColumns,
    initialSort: { key: 'unifiedCode', direction: 'asc' },
  });
  const homologColumnOrder = usePersistentColumnOrder({
    screenKey: 'equivalences-homologs',
    columnKeys: homologColumnKeys,
  });
  const orderedHomologColumns = homologColumnOrder.orderedColumnKeys.map((key) =>
    homologColumns.find((column) => column.key === key)!,
  );

  const exportData: (TabularData & { filename: string }) | null = useMemo(() => {
    if (view === 'groups' && groups.workspace) {
      return {
        filename: 'codigos-unificadores-filtrados',
        sheetName: 'Código Unificador',
        headers: orderedGroupColumns.map((column) => column.label),
        rows: groupTable.visibleRows.map((row) =>
          orderedGroupColumns.map((column) => formatWorkspaceCell(row.values[column.key], column)),
        ),
      };
    }
    if (view === 'homologs') {
      return {
        filename: 'homologos-filtrados',
        sheetName: 'Homólogos',
        headers: orderedHomologColumns.map((column) => column.label),
        rows: homologTable.visibleRows.map((row) =>
          orderedHomologColumns.map((column) => column.getValue(row)),
        ),
      };
    }
    return null;
  }, [
    groupTable.visibleRows,
    groups.workspace,
    homologTable.visibleRows,
    orderedGroupColumns,
    orderedHomologColumns,
    view,
  ]);

  const toggleSelection = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createInline = async () => {
    setSavingNew(true);
    setError(null);
    try {
      const created = await createHomolog({ ...newDraft, active: true });
      setItems((current) => [created, ...current]);
      setNewDraft(emptyDraft);
      setNewRow(false);
      setNotice('Homólogo creado. La fila ya está disponible para edición en celda.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible crear el homólogo.',
      );
    } finally {
      setSavingNew(false);
    }
  };

  const saveCell = async (row: ExternalHomologDto) => {
    if (!editingCell || editingCell.id !== row.id) return;
    const current = editingCell;
    const previous = String(row[current.column]);
    setEditingCell(null);
    if (current.draft.trim() === previous) return;
    const key = `${row.id}:${current.column}`;
    setCellState((state) => ({ ...state, [key]: 'saving' }));
    setError(null);
    try {
      const updated = await updateHomolog(
        row.id,
        homologUpdate(row, current.column, current.draft),
      );
      setItems((rows) => rows.map((item) => (item.id === row.id ? updated : item)));
      setCellState((state) => ({ ...state, [key]: 'saved' }));
      setNotice('Cambio guardado y auditado.');
    } catch (requestError) {
      setCellState((state) => ({ ...state, [key]: 'error' }));
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible guardar la celda.',
      );
    }
  };

  const deactivateSelected = async () => {
    const selected = items.filter((row) => selectedHomologIds.has(row.id) && row.active);
    if (selected.length === 0) return;
    setDeleting(true);
    setError(null);
    const results = await Promise.allSettled(
      selected.map((row) => deactivateHomolog(row.id, row.updatedAt)),
    );
    const succeeded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    setItems((rows) =>
      includeInactive
        ? rows.map((row) => succeeded.find((item) => item.id === row.id) ?? row)
        : rows.filter((row) => !succeeded.some((item) => item.id === row.id)),
    );
    setSelectedHomologIds(new Set());
    setNotice(`${succeeded.length} de ${selected.length} homólogos fueron desactivados.`);
    if (succeeded.length !== selected.length) {
      setError(
        'Algunas filas cambiaron en el servidor y no se desactivaron. Actualiza y vuelve a seleccionarlas.',
      );
    }
    setDeleting(false);
  };

  const reactivateSelected = async () => {
    const selected = items.filter((row) => selectedHomologIds.has(row.id) && !row.active);
    if (selected.length === 0) return;
    setRestoring(true);
    setError(null);
    const results = await Promise.allSettled(
      selected.map((row) =>
        updateHomolog(row.id, { expectedUpdatedAt: row.updatedAt, active: true }),
      ),
    );
    const succeeded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    setItems((rows) => rows.map((row) => succeeded.find((item) => item.id === row.id) ?? row));
    setSelectedHomologIds(new Set());
    setNotice(`${succeeded.length} de ${selected.length} homólogos fueron reactivados.`);
    if (succeeded.length !== selected.length) {
      setError('Algunas filas cambiaron en el servidor y no se reactivaron. Actualiza la vista.');
    }
    setRestoring(false);
  };

  const runEligibleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!eligibleQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setEligibleResults(await searchEligibleHomologs(eligibleQuery.trim()));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible buscar homólogos.',
      );
    } finally {
      setSearching(false);
    }
  };

  const refresh = () => {
    if (view === 'groups') groups.reload();
    else if (view === 'homologs') void load();
  };

  return (
    <>
      <PageHeader
        eyebrow="Relaciones de producto"
        title="Código Unificador y Homólogos"
        description="Administra códigos unificadores, homólogos y OEM sin fusionar la identidad de cada SKU."
      />
      <ScreenGuide
        objective="Mantiene las relaciones que comparten atributos y aplicaciones dentro de un código unificador."
        actions={[
          'Selecciona una vista y usa la barra fija para importar, exportar o mantener filas.',
          'Agrega registros como filas nuevas y edita las celdas permitidas con autoguardado.',
          'La eliminación es lógica y puede aplicarse a varias filas seleccionadas.',
        ]}
        dataSource="Las tres vistas consumen proyecciones y endpoints persistidos del backend."
        limitation="La búsqueda por homólogo u OEM solo expande relaciones activas y aprobadas."
      />

      <div className="sticky top-0 z-20 -mx-1 mb-5 space-y-2 bg-cdr-canvas/95 px-1 py-2 backdrop-blur">
        <nav
          className="grid gap-2 sm:grid-cols-3"
          aria-label="Vistas de Código Unificador y Homólogos"
        >
          {(
            [
              ['groups', 'Código Unificador', groups.workspace?.totalRows ?? '—'],
              ['homologs', 'Homólogos', items.length],
              ['oem', 'OEM', oemCount ?? '—'],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeView(key)}
              className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${
                view === key ? 'border-primary bg-orange-50 ring-1 ring-primary' : 'bg-white'
              }`}
            >
              {label}
              <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-primary">
                {count}
              </span>
            </button>
          ))}
        </nav>
        {view !== 'oem' ? (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 shadow-sm"
            aria-label="Acciones generales"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={loading || groups.loading}
            >
              <RefreshCw
                className={loading || groups.loading ? 'size-4 animate-spin' : 'size-4'}
                aria-hidden="true"
              />
              Actualizar
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/imports">
                <Upload className="size-4" aria-hidden="true" /> Importar
              </Link>
            </Button>
            {exportData ? (
              <TableExportButtons {...exportData} disabled={loading || groups.loading} />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={
                view === 'groups' ? groupColumnOrder.resetOrder : homologColumnOrder.resetOrder
              }
              disabled={
                view === 'groups'
                  ? groupColumnOrder.isDefaultOrder
                  : homologColumnOrder.isDefaultOrder
              }
            >
              <Columns3 className="size-4" aria-hidden="true" /> Restaurar columnas
            </Button>
            {view === 'homologs' && canWrite ? (
              <>
                <Button type="button" size="sm" onClick={() => setNewRow(true)} disabled={newRow}>
                  <Plus className="size-4" aria-hidden="true" /> Agregar fila
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void deactivateSelected()}
                  disabled={deleting || selectedHomologIds.size === 0}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {deleting ? 'Eliminando…' : `Eliminar selección (${selectedHomologIds.size})`}
                </Button>
                {includeInactive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void reactivateSelected()}
                    disabled={restoring || selectedHomologIds.size === 0}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {restoring ? 'Reactivando…' : 'Reactivar selección'}
                  </Button>
                ) : null}
              </>
            ) : null}
            <span className="ml-auto text-xs text-muted-foreground">
              {view === 'groups'
                ? `${selectedGroupIds.size} seleccionados · lectura ERP`
                : `${selectedHomologIds.size} seleccionados`}
            </span>
          </div>
        ) : null}
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

      {view === 'groups' ? (
        groups.loading ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : groups.error ? (
          <StatePanel
            variant="error"
            title="No fue posible cargar los códigos unificadores"
            description={groups.error}
            actionLabel="Reintentar"
            onAction={groups.reload}
          />
        ) : groups.workspace ? (
          <>
            <Card className="mb-4 p-4">
              <label className="relative block max-w-xl">
                <span className="sr-only">Buscar códigos unificadores</span>
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  type="search"
                  value={groupQuery}
                  onChange={(event) => setGroupQuery(event.target.value)}
                  placeholder="Código, nombre, tipo o SKU"
                />
              </label>
            </Card>
            <Card className="overflow-hidden">
              <ExcelTableFilterBar
                filteredColumns={groupTable.filteredColumnKeys.map(
                  (key) => groupColumns.find((column) => column.key === key)?.label ?? key,
                )}
                sort={
                  groupTable.sort
                    ? {
                        label:
                          groupColumns.find((column) => column.key === groupTable.sort?.key)
                            ?.label ?? groupTable.sort.key,
                        direction: groupTable.sort.direction,
                      }
                    : undefined
                }
                visibleCount={groupTable.visibleRows.length}
                totalCount={filteredGroups.length}
                onClear={groupTable.clear}
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todos los códigos unificadores visibles"
                          checked={
                            groupTable.visibleRows.length > 0 &&
                            groupTable.visibleRows.every((row) => selectedGroupIds.has(row.id))
                          }
                          onChange={(event) =>
                            setSelectedGroupIds(
                              event.target.checked
                                ? new Set(groupTable.visibleRows.map((row) => row.id))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      {orderedGroupColumns.map((column) => (
                        <ExcelTableHeader
                          key={column.key}
                          columnKey={column.key}
                          label={column.label}
                          options={groupTable.getValueOptions(column.key)}
                          selectedValues={groupTable.filters[column.key]}
                          sortDirection={
                            groupTable.sort?.key === column.key
                              ? groupTable.sort.direction
                              : undefined
                          }
                          onFilterChange={(values) =>
                            groupTable.setColumnFilter(column.key, values)
                          }
                          onSort={(direction) => groupTable.setSort(column.key, direction)}
                          reorder={groupColumnOrder.getColumnControl(column.key, column.label)}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {groupTable.visibleRows.map((row) => (
                      <tr key={row.id} className="hover:bg-orange-50/40">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${String(row.values.code)}`}
                            checked={selectedGroupIds.has(row.id)}
                            onChange={() => toggleSelection(setSelectedGroupIds, row.id)}
                          />
                        </td>
                        {orderedGroupColumns.map((column) => (
                          <td key={column.key} className="px-4 py-3">
                            {formatWorkspaceCell(row.values[column.key], column)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null
      ) : view === 'oem' ? (
        <OemCodesWorkspace canWrite={canWrite} onCountChange={setOemCount} />
      ) : (
        <>
          <Card className="mb-4 p-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="relative block">
                <span className="sr-only">Buscar en homólogos</span>
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Código unificador, homólogo, marca o estado"
                />
              </label>
              <form className="flex gap-2" onSubmit={runEligibleSearch}>
                <Input
                  value={eligibleQuery}
                  onChange={(event) => setEligibleQuery(event.target.value)}
                  placeholder="Validar homólogo activo/aprobado"
                  aria-label="Código homólogo elegible"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={searching || !eligibleQuery.trim()}
                >
                  <Link2 className="size-4" aria-hidden="true" />
                  {searching ? 'Buscando…' : 'Validar'}
                </Button>
              </form>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Mostrar inactivos
            </label>
            {eligibleResults ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {eligibleResults.length === 0
                  ? 'No existe una relación activa y aprobada.'
                  : `${eligibleResults.length} relación(es) elegible(s): ${eligibleResults
                      .map(
                        (result) =>
                          `${result.homolog.externalCode} → ${result.homolog.unifiedCode}`,
                      )
                      .join(', ')}`}
              </p>
            ) : null}
          </Card>
          {loading ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : (
            <Card className="overflow-hidden">
              <ExcelTableFilterBar
                filteredColumns={homologTable.filteredColumnKeys.map(
                  (key) => homologColumns.find((column) => column.key === key)?.label ?? key,
                )}
                sort={
                  homologTable.sort
                    ? {
                        label:
                          homologColumns.find((column) => column.key === homologTable.sort?.key)
                            ?.label ?? homologTable.sort.key,
                        direction: homologTable.sort.direction,
                      }
                    : undefined
                }
                visibleCount={homologTable.visibleRows.length}
                totalCount={filteredHomologs.length}
                onClear={homologTable.clear}
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todos los homólogos visibles"
                          checked={
                            homologTable.visibleRows.length > 0 &&
                            homologTable.visibleRows.every((row) => selectedHomologIds.has(row.id))
                          }
                          onChange={(event) =>
                            setSelectedHomologIds(
                              event.target.checked
                                ? new Set(homologTable.visibleRows.map((row) => row.id))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      {orderedHomologColumns.map((column) => (
                        <ExcelTableHeader
                          key={column.key}
                          columnKey={column.key}
                          label={column.label}
                          options={homologTable.getValueOptions(column.key)}
                          selectedValues={homologTable.filters[column.key]}
                          sortDirection={
                            homologTable.sort?.key === column.key
                              ? homologTable.sort.direction
                              : undefined
                          }
                          onFilterChange={(values) =>
                            homologTable.setColumnFilter(column.key, values)
                          }
                          onSort={(direction) => homologTable.setSort(column.key, direction)}
                          reorder={homologColumnOrder.getColumnControl(column.key, column.label)}
                        />
                      ))}
                      <th className="px-4 py-3">Guardado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {newRow ? (
                      <tr className="bg-orange-50/50">
                        <td className="px-4 py-2" />
                        {homologColumnOrder.orderedColumnKeys.map((column, index) => (
                          <NewHomologCell
                            key={column}
                            column={column}
                            draft={newDraft}
                            autoFocus={index === 0}
                            onChange={setNewDraft}
                          />
                        ))}
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              aria-label="Guardar nuevo homólogo"
                              disabled={savingNew}
                              onClick={() => void createInline()}
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Cancelar nuevo homólogo"
                              disabled={savingNew}
                              onClick={() => {
                                setNewRow(false);
                                setNewDraft(emptyDraft);
                              }}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {homologTable.visibleRows.map((row) => (
                      <tr key={row.id} className="hover:bg-orange-50/40">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar homólogo ${row.externalCode}`}
                            checked={selectedHomologIds.has(row.id)}
                            onChange={() => toggleSelection(setSelectedHomologIds, row.id)}
                          />
                        </td>
                        {homologColumnOrder.orderedColumnKeys.map((column) => (
                          <HomologDataCell
                            key={column}
                            row={row}
                            column={column}
                            canWrite={canWrite}
                            editingCell={editingCell}
                            state={cellState[`${row.id}:${column}`]}
                            onStart={(editableColumn) =>
                              setEditingCell({
                                id: row.id,
                                column: editableColumn,
                                draft: String(row[editableColumn]),
                              })
                            }
                            onDraft={(editableColumn, draft) =>
                              setEditingCell({ id: row.id, column: editableColumn, draft })
                            }
                            onSave={() => void saveCell(row)}
                            onCancel={() => setEditingCell(null)}
                          />
                        ))}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {Object.entries(cellState).some(
                            ([key, state]) => key.startsWith(`${row.id}:`) && state === 'saving',
                          )
                            ? 'Guardando…'
                            : Object.entries(cellState).some(
                                  ([key, state]) =>
                                    key.startsWith(`${row.id}:`) && state === 'error',
                                )
                              ? 'Error'
                              : 'Al día'}
                        </td>
                      </tr>
                    ))}
                    {!newRow && homologTable.visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                          No hay homólogos que cumplan los filtros.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function NewHomologCell({
  column,
  draft,
  autoFocus,
  onChange,
}: {
  column: HomologColumn;
  draft: HomologDraft;
  autoFocus: boolean;
  onChange: React.Dispatch<React.SetStateAction<HomologDraft>>;
}) {
  if (column === 'source') return <td className="px-4 py-2">Manual</td>;
  if (column === 'active') return <td className="px-4 py-2">Activo</td>;
  if (column === 'approvalStatus') {
    return (
      <td className="px-2 py-2">
        <Select
          label=""
          value={draft.approvalStatus}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              approvalStatus: event.target.value as HomologApprovalStatus,
            }))
          }
        >
          <option value="pending">Pendiente</option>
          <option value="approved">Aprobado</option>
          <option value="rejected">Rechazado</option>
        </Select>
      </td>
    );
  }
  const labels: Record<'unifiedCode' | 'externalCode' | 'externalBrand', string> = {
    unifiedCode: 'Nuevo código unificador',
    externalCode: 'Nuevo código externo',
    externalBrand: 'Nueva marca externa',
  };
  return (
    <td className="px-2 py-2">
      <Input
        autoFocus={autoFocus}
        value={draft[column]}
        onChange={(event) => onChange((current) => ({ ...current, [column]: event.target.value }))}
        aria-label={labels[column]}
      />
    </td>
  );
}

function HomologDataCell({
  row,
  column,
  canWrite,
  editingCell,
  state,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  row: ExternalHomologDto;
  column: HomologColumn;
  canWrite: boolean;
  editingCell: EditingHomologCell | null;
  state?: 'saving' | 'saved' | 'error';
  onStart: (column: EditableHomologColumn) => void;
  onDraft: (column: EditableHomologColumn, draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (column === 'unifiedCode') {
    return <td className="px-4 py-3 font-semibold">{row.unifiedCode}</td>;
  }
  if (column === 'source') {
    return <td className="px-4 py-3">{row.source === 'import' ? 'Importación' : 'Manual'}</td>;
  }
  if (column === 'active') {
    return (
      <td className="px-4 py-3">
        <StatusBadge tone={row.active ? 'success' : 'neutral'}>
          {row.active ? 'Activo' : 'Inactivo'}
        </StatusBadge>
      </td>
    );
  }
  return (
    <EditableHomologCell
      row={row}
      column={column}
      canWrite={canWrite && row.active}
      editing={editingCell?.id === row.id && editingCell.column === column ? editingCell : null}
      state={state}
      onStart={() => onStart(column)}
      onDraft={(draft) => onDraft(column, draft)}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function EditableHomologCell({
  row,
  column,
  canWrite,
  editing,
  state,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  row: ExternalHomologDto;
  column: EditableHomologColumn;
  canWrite: boolean;
  editing: EditingHomologCell | null;
  state?: 'saving' | 'saved' | 'error';
  onStart: () => void;
  onDraft: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const label = homologColumns.find((item) => item.key === column)?.label ?? column;
  const display = column === 'approvalStatus' ? approvalLabels[row.approvalStatus] : row[column];
  if (!editing) {
    return (
      <td className="px-3 py-2">
        <button
          type="button"
          disabled={!canWrite || state === 'saving'}
          className="min-h-9 w-full rounded px-2 text-left hover:bg-white hover:ring-1 hover:ring-orange-200 disabled:cursor-default"
          aria-label={`Editar ${label} de ${row.externalCode}`}
          onClick={onStart}
        >
          {display}
        </button>
      </td>
    );
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <td className="px-2 py-2">
      {column === 'approvalStatus' ? (
        <select
          autoFocus
          aria-label={`Editar ${label}`}
          value={editing.draft}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onSave}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-md border bg-white px-2 text-sm"
        >
          <option value="pending">Pendiente</option>
          <option value="approved">Aprobado</option>
          <option value="rejected">Rechazado</option>
        </select>
      ) : (
        <input
          autoFocus
          aria-label={`Editar ${label}`}
          value={editing.draft}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onSave}
          onKeyDown={onKeyDown}
          className="h-9 w-full min-w-36 rounded-md border bg-white px-2 text-sm"
        />
      )}
    </td>
  );
}
