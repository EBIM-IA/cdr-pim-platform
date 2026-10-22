'use client';

import type {
  GroupOemCodeDto,
  OemApprovalStatus,
  OemSearchResultDto,
  UpdateGroupOemCodeInput,
} from '@cdr/contracts';
import {
  Check,
  Columns3,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ReorderableColumnLabel, usePersistentColumnOrder } from '@/components/column-order';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { TableExportButtons } from '@/components/table-export-buttons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  createOemCode,
  deactivateOemCode,
  listOemCodes,
  searchEligibleOemCodes,
  updateOemCode,
} from '@/lib/operational-api';

type EditableOemColumn = 'oemCode' | 'brands' | 'approvalStatus';
type OemColumn = 'unifiedCode' | EditableOemColumn | 'active';

interface OemDraft {
  unifiedCode: string;
  oemCode: string;
  brands: string;
  approvalStatus: OemApprovalStatus;
}

interface EditingOemCell {
  id: string;
  column: EditableOemColumn;
  draft: string;
}

const emptyDraft: OemDraft = {
  unifiedCode: '',
  oemCode: '',
  brands: '',
  approvalStatus: 'pending',
};

const labels: Record<OemApprovalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const oemColumns: ReadonlyArray<{
  key: OemColumn;
  label: string;
  exportValue: (row: GroupOemCodeDto) => string;
}> = [
  { key: 'unifiedCode', label: 'Código unificador', exportValue: (row) => row.unifiedCode },
  { key: 'oemCode', label: 'Código OEM', exportValue: (row) => row.oemCode },
  { key: 'brands', label: 'Marcas', exportValue: (row) => row.brands.join(', ') },
  {
    key: 'approvalStatus',
    label: 'Aprobación',
    exportValue: (row) => labels[row.approvalStatus],
  },
  { key: 'active', label: 'Estado', exportValue: (row) => (row.active ? 'Activo' : 'Inactivo') },
];

const oemColumnKeys = oemColumns.map((column) => column.key);

function splitBrands(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((brand) => brand.trim())
        .filter(Boolean),
    ),
  ];
}

function oemUpdate(
  row: GroupOemCodeDto,
  column: EditableOemColumn,
  draft: string,
): UpdateGroupOemCodeInput {
  const value = draft.trim();
  if (!value) throw new Error('El valor no puede quedar vacío.');
  if (column === 'brands') {
    return { expectedUpdatedAt: row.updatedAt, brands: splitBrands(value) };
  }
  if (column === 'approvalStatus') {
    if (value !== 'pending' && value !== 'approved' && value !== 'rejected') {
      throw new Error('El estado de aprobación no es válido.');
    }
    return { expectedUpdatedAt: row.updatedAt, approvalStatus: value };
  }
  return { expectedUpdatedAt: row.updatedAt, oemCode: value };
}

export function OemCodesWorkspace({
  canWrite,
  onCountChange,
}: {
  canWrite: boolean;
  onCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<GroupOemCodeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newRow, setNewRow] = useState(false);
  const [newDraft, setNewDraft] = useState<OemDraft>(emptyDraft);
  const [editingCell, setEditingCell] = useState<EditingOemCell | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [eligibleQuery, setEligibleQuery] = useState('');
  const [eligibleResults, setEligibleResults] = useState<OemSearchResultDto[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listOemCodes({ includeInactive });
      setItems(next);
      onCountChange?.(next.length);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar OEM.');
    } finally {
      setLoading(false);
    }
  }, [includeInactive, onCountChange]);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    if (!normalized) return items;
    return items.filter((row) =>
      [row.unifiedCode, row.oemCode, ...row.brands, row.approvalStatus].some((value) =>
        value.toLocaleLowerCase('es').includes(normalized),
      ),
    );
  }, [items, query]);

  const columnOrder = usePersistentColumnOrder({
    screenKey: 'equivalences-oem',
    columnKeys: oemColumnKeys,
  });
  const orderedOemColumns = columnOrder.orderedColumnKeys.map((key) =>
    oemColumns.find((column) => column.key === key)!,
  );

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
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
      const created = await createOemCode({
        unifiedCode: newDraft.unifiedCode,
        oemCode: newDraft.oemCode,
        brands: splitBrands(newDraft.brands),
        approvalStatus: newDraft.approvalStatus,
        active: true,
      });
      setItems((rows) => [created, ...rows]);
      setNewDraft(emptyDraft);
      setNewRow(false);
      setNotice('Código OEM creado.');
      onCountChange?.(items.length + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible crear OEM.');
    } finally {
      setSavingNew(false);
    }
  };

  const saveCell = async (row: GroupOemCodeDto) => {
    if (!editingCell || editingCell.id !== row.id) return;
    const current = editingCell;
    const previous =
      current.column === 'brands' ? row.brands.join(', ') : String(row[current.column]);
    setEditingCell(null);
    if (current.draft.trim() === previous) return;
    const key = `${row.id}:${current.column}`;
    setSavingCell(key);
    setError(null);
    try {
      const updated = await updateOemCode(row.id, oemUpdate(row, current.column, current.draft));
      setItems((rows) => rows.map((item) => (item.id === row.id ? updated : item)));
      setNotice('Cambio OEM guardado y auditado.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible guardar OEM.',
      );
    } finally {
      setSavingCell(null);
    }
  };

  const deactivateSelected = async () => {
    const selected = items.filter((row) => selectedIds.has(row.id) && row.active);
    if (selected.length === 0) return;
    setDeleting(true);
    setError(null);
    const results = await Promise.allSettled(
      selected.map((row) => deactivateOemCode(row.id, row.updatedAt)),
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
    setNotice(`${succeeded.length} de ${selected.length} códigos OEM fueron desactivados.`);
    if (succeeded.length !== selected.length) {
      setError('Algunas filas cambiaron en el servidor y no se desactivaron. Actualiza la vista.');
    }
    setDeleting(false);
  };

  const reactivateSelected = async () => {
    const selected = items.filter((row) => selectedIds.has(row.id) && !row.active);
    if (selected.length === 0) return;
    setRestoring(true);
    setError(null);
    const results = await Promise.allSettled(
      selected.map((row) =>
        updateOemCode(row.id, { expectedUpdatedAt: row.updatedAt, active: true }),
      ),
    );
    const succeeded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    setItems((rows) => rows.map((row) => succeeded.find((item) => item.id === row.id) ?? row));
    setSelectedIds(new Set());
    setNotice(`${succeeded.length} de ${selected.length} códigos OEM fueron reactivados.`);
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
      setEligibleResults(await searchEligibleOemCodes(eligibleQuery.trim()));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible buscar OEM.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-[7.25rem] z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 shadow-sm">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
          Actualizar
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/imports?view=new&target=oem">
            <Upload className="size-4" aria-hidden="true" /> Importar
          </Link>
        </Button>
        <TableExportButtons
          filename="codigos-oem-filtrados"
          sheetName="OEM"
          headers={orderedOemColumns.map((column) => column.label)}
          rows={filtered.map((row) => orderedOemColumns.map((column) => column.exportValue(row)))}
          disabled={loading}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={columnOrder.resetOrder}
          disabled={columnOrder.isDefaultOrder}
          title="Restaurar el orden original de las columnas"
        >
          <Columns3 className="size-4" aria-hidden="true" /> Restaurar columnas
        </Button>
        {canWrite ? (
          <>
            <Button type="button" size="sm" onClick={() => setNewRow(true)} disabled={newRow}>
              <Plus className="size-4" aria-hidden="true" /> Agregar fila
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void deactivateSelected()}
              disabled={deleting || selectedIds.size === 0}
            >
              <Trash2 className="size-4" aria-hidden="true" />
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
                <RotateCcw className="size-4" aria-hidden="true" />
                {restoring ? 'Reactivando…' : 'Reactivar selección'}
              </Button>
            ) : null}
          </>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {selectedIds.size} seleccionados
        </span>
      </div>

      {notice ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="relative block">
            <span className="sr-only">Buscar en OEM</span>
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Código OEM, unificador, marca o estado"
            />
          </label>
          <form className="flex gap-2" onSubmit={runEligibleSearch}>
            <Input
              value={eligibleQuery}
              onChange={(event) => setEligibleQuery(event.target.value)}
              placeholder="Validar OEM activo/aprobado"
              aria-label="Código OEM o marca elegible"
            />
            <Button type="submit" variant="outline" disabled={searching || !eligibleQuery.trim()}>
              {searching ? 'Buscando…' : 'Validar'}
            </Button>
          </form>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />{' '}
          Mostrar inactivos
        </label>
        {eligibleResults ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {eligibleResults.length === 0
              ? 'No existe una relación OEM activa y aprobada.'
              : `${eligibleResults.length} relación(es) elegible(s).`}
          </p>
        ) : null}
      </Card>

      {loading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : filtered.length === 0 && !newRow ? (
        <StatePanel
          variant="empty"
          title="Sin códigos OEM"
          description="No hay relaciones OEM que coincidan con los filtros."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los OEM visibles"
                      checked={
                        filtered.length > 0 && filtered.every((row) => selectedIds.has(row.id))
                      }
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked ? new Set(filtered.map((row) => row.id)) : new Set(),
                        )
                      }
                    />
                  </th>
                  {orderedOemColumns.map((column) => (
                    <th key={column.key} className="px-4 py-3">
                      <ReorderableColumnLabel
                        control={columnOrder.getColumnControl(column.key, column.label)}
                      />
                    </th>
                  ))}
                  <th className="px-4 py-3">Guardado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {newRow ? (
                  <tr className="bg-orange-50/50">
                    <td className="px-4 py-2" />
                    {orderedOemColumns.map((column) => (
                      <NewOemCell
                        key={column.key}
                        column={column.key}
                        draft={newDraft}
                        onChange={setNewDraft}
                      />
                    ))}
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          aria-label="Guardar nuevo OEM"
                          disabled={savingNew}
                          onClick={() => void createInline()}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Cancelar nuevo OEM"
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
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-orange-50/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar OEM ${row.oemCode}`}
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelection(row.id)}
                      />
                    </td>
                    {orderedOemColumns.map((column) => (
                      <OemDataCell
                        key={column.key}
                        column={column.key}
                        row={row}
                        canWrite={canWrite}
                        editingCell={editingCell}
                        savingCell={savingCell}
                        onStart={setEditingCell}
                        onDraft={setEditingCell}
                        onSave={() => void saveCell(row)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ))}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {savingCell?.startsWith(`${row.id}:`) ? 'Guardando…' : 'Al día'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function NewOemCell({
  column,
  draft,
  onChange,
}: {
  column: OemColumn;
  draft: OemDraft;
  onChange: Dispatch<SetStateAction<OemDraft>>;
}) {
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
              approvalStatus: event.target.value as OemApprovalStatus,
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

  const field = column;
  const ariaLabel =
    column === 'unifiedCode'
      ? 'Nuevo código unificador OEM'
      : column === 'oemCode'
        ? 'Nuevo código OEM'
        : 'Nuevas marcas OEM';
  return (
    <td className="px-2 py-2">
      <Input
        autoFocus={column === 'unifiedCode'}
        aria-label={ariaLabel}
        value={draft[field]}
        onChange={(event) => onChange((current) => ({ ...current, [field]: event.target.value }))}
        placeholder={column === 'brands' ? 'Separadas por coma' : undefined}
      />
    </td>
  );
}

function OemDataCell({
  column,
  row,
  canWrite,
  editingCell,
  savingCell,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  column: OemColumn;
  row: GroupOemCodeDto;
  canWrite: boolean;
  editingCell: EditingOemCell | null;
  savingCell: string | null;
  onStart: (next: EditingOemCell) => void;
  onDraft: (next: EditingOemCell) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (column === 'unifiedCode') {
    return <td className="px-4 py-3 font-semibold">{row.unifiedCode}</td>;
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
    <EditableOemCell
      row={row}
      column={column}
      canWrite={canWrite && row.active}
      editing={editingCell?.id === row.id && editingCell.column === column ? editingCell : null}
      saving={savingCell === `${row.id}:${column}`}
      onStart={() =>
        onStart({
          id: row.id,
          column,
          draft: column === 'brands' ? row.brands.join(', ') : String(row[column]),
        })
      }
      onDraft={(draft) => onDraft({ id: row.id, column, draft })}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function EditableOemCell({
  row,
  column,
  canWrite,
  editing,
  saving,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  row: GroupOemCodeDto;
  column: EditableOemColumn;
  canWrite: boolean;
  editing: EditingOemCell | null;
  saving: boolean;
  onStart: () => void;
  onDraft: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const label = column === 'oemCode' ? 'Código OEM' : column === 'brands' ? 'Marcas' : 'Aprobación';
  const display =
    column === 'brands'
      ? row.brands.join(', ')
      : column === 'approvalStatus'
        ? labels[row.approvalStatus]
        : row.oemCode;
  if (!editing)
    return (
      <td className="px-3 py-2">
        <button
          type="button"
          disabled={!canWrite || saving}
          aria-label={`Editar ${label} de ${row.oemCode}`}
          className="min-h-9 w-full rounded px-2 text-left hover:bg-white hover:ring-1 hover:ring-orange-200 disabled:cursor-default"
          onClick={onStart}
        >
          {display}
        </button>
      </td>
    );
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
