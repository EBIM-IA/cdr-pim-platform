'use client';

import type {
  CatalogCategorySummaryDto,
  CatalogWorkbookColumnDto,
  CatalogWorkbookProductDto,
  HomologApprovalStatus,
} from '@cdr/contracts';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Columns3,
  Download,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { usePersistentColumnOrder } from '@/components/column-order';
import {
  ExcelTableFilterBar,
  ExcelTableHeader,
  useExcelTableRows,
  type ExcelTableColumn,
} from '@/components/excel-table-filter';
import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { fetchCatalogCategories } from '@/lib/dynamic-catalog-api';
import {
  categoryLevels,
  equivalenceMatches,
  fetchEquivalenceCatalog,
  homologRelation,
  oemRelation,
  relationGroupMembers,
  splitOemBrands,
  type EquivalenceRelation,
} from '@/lib/equivalence-view';
import {
  createHomolog,
  createOemCode,
  deactivateHomolog,
  deactivateOemCode,
  listHomologs,
  listOemCodes,
  updateHomolog,
  updateOemCode,
} from '@/lib/operational-api';
import { downloadXlsx } from '@/lib/tabular-export';

import styles from './equivalences-workspace.module.css';

type View = 'groups' | 'homologs' | 'oem' | 'identifiers';
type RelationKind = 'homologs' | 'oem';
type RelationKey =
  | 'unifiedCode'
  | 'code'
  | 'brand'
  | 'approvalStatus'
  | 'store'
  | 'source'
  | 'name'
  | 'referenceType'
  | 'note'
  | 'application'
  | 'origin';
interface Draft {
  unifiedCode: string;
  code: string;
  brand: string;
  approvalStatus: HomologApprovalStatus;
}
interface Editing {
  id: string;
  key: 'code' | 'brand' | 'approvalStatus';
  value: string;
  expectedUpdatedAt: string;
}
interface Assignment {
  id: string;
  product: CatalogWorkbookProductDto;
  values: Record<string, string | number>;
}
const approvals: Record<HomologApprovalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};
const statuses: Record<string, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  published: 'Publicado',
  archived: 'Archivado',
};
const newDraft = (): Draft => ({ unifiedCode: '', code: '', brand: '', approvalStatus: 'pending' });
const baseAssignmentColumns = [
  ['unifiedCode', 'Código unificador'],
  ['sku', 'SKU'],
  ['provider', 'Código de proveedor'],
  ['brand', 'Marca'],
  ['n1', 'Categoría principal'],
  ['n2', 'Categoría segundo nivel'],
  ['n3', 'Categoría tercer nivel'],
  ['status', 'Estado SKU'],
  ['group', 'Grupo'],
  ['homologs', 'Homólogos'],
  ['oem', 'OEM'],
  ['sync', 'Sincronización AX'],
  ['name', 'Descripción'],
] as const;
const relationKeys = (
  kind: RelationKind,
): readonly { key: RelationKey; label: string; required?: boolean }[] => [
  { key: 'unifiedCode', label: 'Código unificador', required: true },
  { key: 'code', label: kind === 'homologs' ? 'Código homólogo' : 'Código OEM', required: true },
  { key: 'brand', label: kind === 'homologs' ? 'Marca homólogo' : 'Marca', required: true },
  { key: 'approvalStatus', label: 'Estado' },
  { key: 'store', label: 'SKU asociados' },
  { key: 'source', label: 'Fuente' },
  ...(kind === 'homologs'
    ? [
        { key: 'name' as const, label: 'Nombre' },
        { key: 'referenceType' as const, label: 'Tipo de referencia' },
        { key: 'note' as const, label: 'Observación' },
      ]
    : [{ key: 'application' as const, label: 'Tipo de aplicación' }]),
  { key: 'origin', label: 'Origen' },
];
const errorMessage = (failure: unknown) =>
  failure instanceof Error ? failure.message : 'No se pudo completar la operación.';

export function EquivalencesWorkspace({
  canWrite,
  canViewCompleteness = false,
  canViewProductStatus = true,
}: {
  canWrite: boolean;
  canViewCompleteness?: boolean;
  canViewProductStatus?: boolean;
}) {
  const [view, setView] = useState<View>('groups');
  const [group, setGroup] = useState('');
  const [sku, setSku] = useState('');
  const [catalog, setCatalog] = useState<CatalogWorkbookProductDto[]>([]);
  const [catalogColumns, setCatalogColumns] = useState<CatalogWorkbookColumnDto[]>([]);
  const [categories, setCategories] = useState<CatalogCategorySummaryDto[]>([]);
  const [homologs, setHomologs] = useState<EquivalenceRelation[]>([]);
  const [oems, setOems] = useState<EquivalenceRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [queries, setQueries] = useState<Record<string, string>>({
    groups: '',
    homologs: '',
    oem: '',
  });
  const [includeInactive, setIncludeInactive] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<RelationKind, Draft>>>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteRows, setDeleteRows] = useState<EquivalenceRelation[] | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const value = params.get('view');
      setView(
        value === 'homologs' || value === 'homologues'
          ? 'homologs'
          : value === 'oem'
            ? 'oem'
            : value === 'identifiers'
              ? 'identifiers'
              : 'groups',
      );
      setGroup(params.get('group') ?? '');
      setSku(params.get('sku') ?? '');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      fetchEquivalenceCatalog(controller.signal),
      fetchCatalogCategories(controller.signal),
      listHomologs({ includeInactive: true }, controller.signal),
      listOemCodes({ includeInactive: true }, controller.signal),
    ])
      .then(([data, tree, external, original]) => {
        if (controller.signal.aborted) return;
        setCatalog(data.items);
        setCatalogColumns(data.columns);
        setCategories(tree);
        setHomologs(external.map(homologRelation));
        setOems(original.map(oemRelation));
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  const dirty =
    !!editing ||
    Object.values(drafts).some(
      (draft) => !!draft && [draft.unifiedCode, draft.code, draft.brand].some(Boolean),
    );
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function navigate(next: View, code = '', selectedSku = '') {
    if (saving) return;
    if (editing && !window.confirm('Hay una celda sin guardar. ¿Descartar ese cambio?')) return;
    setEditing(null);
    setView(next);
    setGroup(code);
    setSku(selectedSku);
    setSelected(new Set());
    setError('');
    const params = new URLSearchParams();
    if (next !== 'groups') params.set('view', next);
    if (code) params.set('group', code);
    if (selectedSku) params.set('sku', selectedSku);
    window.history.pushState({}, '', `/equivalences${params.size ? `?${params}` : ''}`);
  }
  const productGroups = useMemo(() => {
    const index = new Map<string, CatalogWorkbookProductDto[]>();
    for (const product of catalog) {
      if (!product.unifiedCode) continue;
      const members = index.get(product.unifiedCode) ?? [];
      members.push(product);
      index.set(product.unifiedCode, members);
    }
    return index;
  }, [catalog]);
  const homologCounts = useMemo(() => {
    const index = new Map<string, number>();
    for (const row of homologs) {
      if (row.active) index.set(row.unifiedCode, (index.get(row.unifiedCode) ?? 0) + 1);
    }
    return index;
  }, [homologs]);
  const oemCounts = useMemo(() => {
    const index = new Map<string, number>();
    for (const row of oems) {
      if (row.active) index.set(row.unifiedCode, (index.get(row.unifiedCode) ?? 0) + 1);
    }
    return index;
  }, [oems]);
  const groupCodes = useMemo(
    () =>
      [
        ...new Set(
          catalog.map((product) => product.unifiedCode).filter((code): code is string => !!code),
        ),
      ].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    [catalog],
  );
  const members = useMemo(() => relationGroupMembers(group, catalog), [group, catalog]);
  const groupProduct = members[0];
  const assigned = useMemo(
    () =>
      catalog
        .filter((product) => !!product.unifiedCode)
        .map((product): Assignment => {
          const code = product.unifiedCode!;
          const levels = categoryLevels(product, categories);
          return {
            id: product.id,
            product,
            values: {
              unifiedCode: code,
              sku: product.sku,
              provider: product.providerCode ?? '',
              brand: product.brand ?? '',
              n1: levels[0] ?? '',
              n2: levels[1] ?? '',
              n3: levels[2] ?? '',
              status: statuses[product.status] ?? product.status,
              group: productGroups.get(code)?.length ?? 0,
              homologs: homologCounts.get(code) ?? 0,
              oem: oemCounts.get(code) ?? 0,
              sync: 'Sin registro de sincronización',
              name: product.name,
            },
          };
        }),
    [catalog, categories, productGroups, homologCounts, oemCounts],
  );
  const assignmentColumns = useMemo<readonly ExcelTableColumn<Assignment, string>[]>(
    () =>
      baseAssignmentColumns
        .filter(([key]) => canViewProductStatus || !['status', 'name'].includes(key))
        .map(([key, label]) => ({ key, label, getValue: (row) => row.values[key] })),
    [canViewProductStatus],
  );
  const filteredAssignments = useMemo(
    () =>
      assigned.filter((row) =>
        equivalenceMatches(
          queries.groups ?? '',
          assignmentColumns.map((column) => column.getValue(row)),
        ),
      ),
    [assigned, assignmentColumns, queries.groups],
  );
  const assignmentTable = useExcelTableRows({
    rows: filteredAssignments,
    columns: assignmentColumns,
  });
  const assignmentOrder = usePersistentColumnOrder({
    screenKey: 'equiv:sku',
    columnKeys: assignmentColumns.map((column) => column.key),
  });
  const assignmentVisible = assignmentOrder.orderedColumnKeys
    .map((key) => assignmentColumns.find((column) => column.key === key)!)
    .filter(Boolean);
  const kind: RelationKind = view === 'oem' ? 'oem' : 'homologs';
  const relationItems = kind === 'oem' ? oems : homologs;
  const homologDefinitions = useMemo(() => relationKeys('homologs'), []);
  const oemDefinitions = useMemo(() => relationKeys('oem'), []);
  const relationDefinitions = kind === 'homologs' ? homologDefinitions : oemDefinitions;
  const relationValue = (row: EquivalenceRelation, key: RelationKey): string | number =>
    key === 'store'
      ? (productGroups.get(row.unifiedCode) ?? []).map((product) => product.sku).join(' · ')
      : key === 'approvalStatus'
        ? !row.active
          ? 'Inactivo'
          : approvals[row.approvalStatus]
        : key === 'origin'
          ? row.source === 'import'
            ? 'Importación'
            : 'Manual'
          : key === 'application'
            ? [
                ...new Set(
                  (productGroups.get(row.unifiedCode) ?? []).flatMap(
                    (product) => product.applicationTypes,
                  ),
                ),
              ].join(' · ')
            : ['source', 'name', 'referenceType', 'note'].includes(key)
              ? ''
              : row[key as 'unifiedCode' | 'code' | 'brand'];
  const relationColumns = (
    definitions: typeof relationDefinitions,
  ): readonly ExcelTableColumn<EquivalenceRelation, RelationKey>[] =>
    definitions.map((column) => ({
      ...column,
      getValue: (row) => relationValue(row, column.key),
    }));
  const filteredRelations = (
    rows: EquivalenceRelation[],
    nextKind: RelationKind,
    definitions: typeof relationDefinitions,
  ) =>
    rows.filter(
      (row) =>
        (includeInactive || row.active) &&
        equivalenceMatches(
          queries[nextKind] ?? '',
          definitions.map((column) => relationValue(row, column.key)),
        ),
    );
  const homologTable = useExcelTableRows({
    rows: filteredRelations(homologs, 'homologs', homologDefinitions),
    columns: relationColumns(homologDefinitions),
  });
  const oemTable = useExcelTableRows({
    rows: filteredRelations(oems, 'oem', oemDefinitions),
    columns: relationColumns(oemDefinitions),
  });
  const relationTable = kind === 'homologs' ? homologTable : oemTable;
  const relationOrder = usePersistentColumnOrder({
    screenKey: `equivalences-${kind}-v2`,
    columnKeys: relationDefinitions.map((column) => column.key),
  });
  const relationVisible = relationOrder.orderedColumnKeys
    .map((key) => relationDefinitions.find((column) => column.key === key)!)
    .filter(Boolean);
  const activeDraft = drafts[kind];
  function setRelation(row: EquivalenceRelation) {
    if (kind === 'homologs')
      setHomologs((current) =>
        current.some((item) => item.id === row.id)
          ? current.map((item) => (item.id === row.id ? row : item))
          : [row, ...current],
      );
    else
      setOems((current) =>
        current.some((item) => item.id === row.id)
          ? current.map((item) => (item.id === row.id ? row : item))
          : [row, ...current],
      );
    setSaved((current) => new Set([...current, row.id]));
  }
  async function saveNew() {
    if (!canWrite || !activeDraft || savingLock.current) return;
    const draft = activeDraft;
    if (!draft.unifiedCode.trim() || !draft.code.trim() || !draft.brand.trim()) {
      setError('Completa código unificador, código y marca antes de guardar.');
      return;
    }
    savingLock.current = true;
    setSaving(true);
    setError('');
    try {
      const row =
        kind === 'homologs'
          ? homologRelation(
              await createHomolog({
                unifiedCode: draft.unifiedCode.trim(),
                externalCode: draft.code.trim(),
                externalBrand: draft.brand.trim(),
                approvalStatus: draft.approvalStatus,
                active: true,
              }),
            )
          : oemRelation(
              await createOemCode({
                unifiedCode: draft.unifiedCode.trim(),
                oemCode: draft.code.trim(),
                brands: splitOemBrands(draft.brand),
                approvalStatus: draft.approvalStatus,
                active: true,
              }),
            );
      setRelation(row);
      setDrafts((current) => ({ ...current, [kind]: undefined }));
      setNotice(
        `${kind === 'homologs' ? 'Homólogo' : 'Código OEM'} guardado y asociado a ${row.unifiedCode}.`,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }
  async function saveEditing(row: EquivalenceRelation) {
    if (!canWrite || !editing || editing.id !== row.id || savingLock.current) return;
    const edit = editing;
    if (edit.value.trim() === row[edit.key]) {
      setEditing(null);
      return;
    }
    if (!edit.value.trim()) {
      setError('El valor no puede quedar vacío.');
      return;
    }
    savingLock.current = true;
    setSaving(true);
    setError('');
    try {
      const changes =
        edit.key === 'code'
          ? kind === 'homologs'
            ? { externalCode: edit.value.trim() }
            : { oemCode: edit.value.trim() }
          : edit.key === 'brand'
            ? kind === 'homologs'
              ? { externalBrand: edit.value.trim() }
              : { brands: splitOemBrands(edit.value) }
            : { approvalStatus: edit.value as HomologApprovalStatus };
      const updated =
        kind === 'homologs'
          ? homologRelation(
              await updateHomolog(row.id, {
                expectedUpdatedAt: edit.expectedUpdatedAt,
                ...changes,
              }),
            )
          : oemRelation(
              await updateOemCode(row.id, {
                expectedUpdatedAt: edit.expectedUpdatedAt,
                ...changes,
              }),
            );
      setRelation(updated);
      setEditing(null);
      setNotice('Cambio guardado y auditado.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }
  async function applySelected(reactivate = false) {
    if (!canWrite || savingLock.current) return;
    const rows = reactivate
      ? relationItems.filter((row) => selected.has(row.id) && !row.active)
      : (deleteRows ?? []);
    savingLock.current = true;
    setSaving(true);
    let count = 0;
    let failure = '';
    for (const row of rows) {
      try {
        const updated = reactivate
          ? kind === 'homologs'
            ? homologRelation(
                await updateHomolog(row.id, { expectedUpdatedAt: row.updatedAt, active: true }),
              )
            : oemRelation(
                await updateOemCode(row.id, { expectedUpdatedAt: row.updatedAt, active: true }),
              )
          : kind === 'homologs'
            ? homologRelation(await deactivateHomolog(row.id, row.updatedAt))
            : oemRelation(await deactivateOemCode(row.id, row.updatedAt));
        setRelation(updated);
        count += 1;
      } catch (error) {
        failure = errorMessage(error);
      }
    }
    setSelected(new Set());
    setDeleteRows(null);
    setNotice(
      `${count} de ${rows.length} registros ${reactivate ? 'reactivados' : 'desactivados'}.`,
    );
    if (failure) setError(failure);
    savingLock.current = false;
    setSaving(false);
  }
  function exportTable(template = false) {
    if (view === 'groups') {
      downloadXlsx(
        {
          headers: assignmentVisible.map((column) => column.label),
          rows: template
            ? []
            : assignmentTable.visibleRows.map((row) =>
                assignmentVisible.map((column) => column.getValue(row)),
              ),
          sheetName: 'Código unificador',
        },
        template ? 'Plantilla códigos unificadores' : 'Códigos unificadores',
      );
      return;
    }
    const templateHeaders =
      kind === 'homologs'
        ? ['codigo_unificador', 'codigo_homologo', 'marca_homologo', 'estado_aprobacion', 'activo']
        : ['codigo_unificador', 'codigo_oem', 'marcas', 'estado_aprobacion', 'activo'];
    downloadXlsx(
      template
        ? { headers: templateHeaders, rows: [], sheetName: 'Plantilla' }
        : {
            headers: relationVisible.map((column) => column.label),
            rows: relationTable.visibleRows.map((row) =>
              relationVisible.map((column) => relationValue(row, column.key)),
            ),
            sheetName: kind === 'homologs' ? 'Homólogos' : 'OEM',
          },
      template
        ? `Plantilla ${kind === 'homologs' ? 'homólogos' : 'OEM'}`
        : kind === 'homologs'
          ? 'Homólogos'
          : 'Códigos OEM',
    );
  }
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectedProduct =
    catalog.find((product) => product.sku === sku || product.id === sku) ?? catalog[0];
  function openRelations(next: RelationKind, code: string, create = false) {
    navigate(next);
    setQueries((current) => ({ ...current, [next]: code }));
    if (create && canWrite)
      setDrafts((current) => ({
        ...current,
        [next]: current[next] ?? { ...newDraft(), unifiedCode: code },
      }));
  }
  function cell(row: EquivalenceRelation, key: RelationKey) {
    const value = relationValue(row, key);
    if (key === 'unifiedCode')
      return (
        <button className={styles.code} onClick={() => navigate('groups', row.unifiedCode)}>
          {row.unifiedCode}
        </button>
      );
    if (key === 'store') {
      const associated = productGroups.get(row.unifiedCode) ?? [];
      return associated.length ? (
        <>
          <button className={styles.code} onClick={() => navigate('groups', row.unifiedCode)}>
            {associated.length} SKU
          </button>
          <small className={styles.subline}>{value}</small>
        </>
      ) : (
        <span className={styles.unavailable}>Sin SKU asociados</span>
      );
    }
    if (['code', 'brand', 'approvalStatus'].includes(key) && canWrite && row.active) {
      const editableKey = key as Editing['key'];
      const isEditing = editing?.id === row.id && editing.key === editableKey;
      return isEditing ? (
        editableKey === 'approvalStatus' ? (
          <select
            autoFocus
            aria-label="Editar Estado"
            value={editing.value}
            disabled={saving}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            onBlur={() => void saveEditing(row)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setEditing(null);
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          >
            {Object.entries(approvals).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <input
            autoFocus
            aria-label={`Editar ${editableKey === 'code' ? 'Código' : 'Marca'}`}
            maxLength={160}
            value={editing.value}
            disabled={saving}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            onBlur={() => void saveEditing(row)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setEditing(null);
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        )
      ) : (
        <button
          type="button"
          aria-label={`Editar ${key === 'code' ? 'Código' : key === 'brand' ? 'Marca' : 'Estado'} de ${row.code}`}
          disabled={saving}
          onClick={() =>
            setEditing({
              id: row.id,
              key: editableKey,
              value: String(row[editableKey]),
              expectedUpdatedAt: row.updatedAt,
            })
          }
        >
          {value}
        </button>
      );
    }
    if (key === 'approvalStatus')
      return (
        <StatusBadge
          tone={
            !row.active
              ? 'neutral'
              : row.approvalStatus === 'approved'
                ? 'success'
                : row.approvalStatus === 'rejected'
                  ? 'danger'
                  : 'warning'
          }
        >
          {String(value)}
        </StatusBadge>
      );
    if (!value)
      return (
        <span className={styles.unavailable} title="Dato no registrado en el PIM">
          —
        </span>
      );
    return String(value);
  }
  const isDetail = !!group && view === 'groups';
  const title =
    view === 'identifiers' ? 'Identificadores y homólogos' : 'Código Unificador y Homólogos';
  return (
    <div className={styles.workspace}>
      {isDetail ? (
        <nav className={styles.crumb} aria-label="Ruta de equivalencias">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <button onClick={() => navigate('groups')}>Código Unificador y Homólogos</button>
          <span>/</span>
          <span aria-current="page">{group}</span>
        </nav>
      ) : null}
      <PageHeader
        title={title}
        description={
          view === 'identifiers'
            ? 'Identificadores del SKU, homólogos del código unificador y relacionados en tienda.'
            : 'Agrupación de SKU por código unificador; homólogos de otras marcas y códigos OEM.'
        }
        actions={
          isDetail || view === 'identifiers' ? (
            <Button variant="outline" onClick={() => navigate('groups')}>
              <ArrowLeft className="size-3.5" />
              Volver al listado
            </Button>
          ) : undefined
        }
      />
      <ScreenGuide
        objective="Consulta las asignaciones que envía AX y mantiene homólogos y OEM por código unificador."
        actions={[
          'Filtra y ordena cualquier columna, consulta el grupo o abre la ficha de un SKU.',
          ...(canWrite
            ? [
                'Agrega homólogos y OEM como filas nuevas; las celdas permitidas se guardan al salir.',
                'Exporta las filas filtradas o descarga la plantilla de importación.',
              ]
            : ['Exporta las filas filtradas a Excel.']),
        ]}
        dataSource="Catálogo y relaciones persistidos en el PIM."
        limitation="AX gobierna el código unificador. No se registra sincronización con AX ni se fusionan fichas desde esta pantalla."
      />
      {error ? (
        <div role="alert" className={`${styles.message} ${styles.error}`}>
          {error}
          <button
            className="ml-2 underline"
            disabled={saving}
            onClick={() => setRevision((current) => current + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {notice ? (
        <div role="status" className={styles.message}>
          {notice}
        </div>
      ) : null}
      {loading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : isDetail ? (
        <>
          {!members.length ? (
            <StatePanel
              variant="empty"
              title="Código unificador sin SKU registrados"
              description={`No hay productos asociados a ${group} en el catálogo actual.`}
            />
          ) : (
            <>
              <section className={`${styles.card} ${styles.hero}`} aria-label="Resumen del grupo">
                <div>
                  <span className={styles.eyebrow}>Código unificador · recibido desde ERP</span>
                  <h2>{group}</h2>
                  <div className={styles.chips}>
                    <span className={styles.chip}>
                      Categoría: {groupProduct?.category?.name ?? 'Pendiente'}
                    </span>
                    <span className={styles.chip}>
                      Aplicación:{' '}
                      {[...new Set(members.flatMap((product) => product.applicationTypes))].join(
                        ' · ',
                      ) || 'Sin registrar'}
                    </span>
                  </div>
                  <dl className={styles.stats}>
                    <div>
                      <dt>SKU relacionados</dt>
                      <dd>{members.length}</dd>
                      <small>Cada SKU conserva su ficha</small>
                    </div>
                    <div>
                      <dt>Marcas</dt>
                      <dd>
                        {new Set(members.map((product) => product.brand).filter(Boolean)).size}
                      </dd>
                      <small>
                        {[...new Set(members.map((product) => product.brand).filter(Boolean))].join(
                          ' · ',
                        )}
                      </small>
                    </div>
                    {canViewCompleteness ? (
                      <div>
                        <dt>Completitud promedio</dt>
                        <dd>
                          {members.every((product) => product.completeness !== null)
                            ? `${Math.round(members.reduce((total, product) => total + (product.completeness ?? 0), 0) / members.length)}%`
                            : '—'}
                        </dd>
                      </div>
                    ) : null}
                    {canViewProductStatus ? (
                      <div>
                        <dt>Publicados</dt>
                        <dd>
                          {members.filter((product) => product.status === 'published').length}/
                          {members.length}
                        </dd>
                        <small>Estado independiente por SKU</small>
                      </div>
                    ) : null}
                  </dl>
                </div>
                <div className={styles.criterion}>
                  <h3>Criterio de agrupación</h3>
                  <p>
                    Los SKU comparten el código unificador <strong>{group}</strong> recibido desde
                    ERP.
                  </p>
                  <p>
                    Cada producto conserva su identidad, atributos y documentos. La agrupación
                    permite consultar alternativas entre marcas.
                  </p>
                </div>
              </section>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h2>SKU equivalentes · {members.length}</h2>
                    <p>
                      Cada fila es un SKU independiente con su propia ficha. Fuente base: ERP ·
                      Sismetic / AX.
                    </p>
                  </div>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {[
                          'SKU',
                          'Marca',
                          ...(canViewProductStatus ? ['Descripción'] : []),
                          'Código proveedor',
                          'Tipo de aplicación',
                          'Actualizado',
                          ...(canViewCompleteness ? ['Completitud'] : []),
                          ...(canViewProductStatus ? ['Estado'] : []),
                          'Acción',
                        ].map((label) => (
                          <th key={label} scope="col">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <Link className={styles.code} href={`/products/${product.id}`}>
                              {product.sku}
                            </Link>
                          </td>
                          <td>{product.brand ?? '—'}</td>
                          {canViewProductStatus ? (
                            <td title={product.name}>{product.name}</td>
                          ) : null}
                          <td>{product.providerCode ?? '—'}</td>
                          <td>{product.applicationTypes.join(' · ') || '—'}</td>
                          <td>{new Date(product.updatedAt).toLocaleDateString('es-EC')}</td>
                          {canViewCompleteness ? (
                            <td>
                              {product.completeness === null ? '—' : `${product.completeness}%`}
                            </td>
                          ) : null}
                          {canViewProductStatus ? (
                            <td>{statuses[product.status] ?? product.status}</td>
                          ) : null}
                          <td>
                            <div className={styles.rowActions}>
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/products/${product.id}`}>Ver ficha</Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate('identifiers', '', product.sku)}
                              >
                                Identificadores
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.foot}>
                  La asignación del código unificador se realiza en ERP. No se fusionan productos ni
                  se modifica su identidad.
                </p>
              </section>
              <section className={`${styles.card} ${styles.rule}`}>
                <span className={styles.eyebrow}>Cómo funciona</span>
                <h3>Agrupación, no fusión</h3>
                <ol>
                  <li>
                    <strong>Viene de ERP.</strong> El código unificador lo asigna Sismetic / AX.
                  </li>
                  <li>
                    <strong>Agrupa SKU relacionados.</strong> Reúne alternativas de distintas
                    marcas.
                  </li>
                  <li>
                    <strong>No fusiona fichas.</strong> Cada SKU conserva su estado y sus atributos.
                  </li>
                  <li>
                    <strong>Correcciones.</strong> Los datos gobernados por AX mantienen el valor
                    del ERP.
                  </li>
                </ol>
              </section>
              <GroupRelations
                kind="homologs"
                code={group}
                rows={homologs.filter((row) => row.unifiedCode === group && row.active)}
                canWrite={canWrite}
                onManage={openRelations}
              />
              <GroupRelations
                kind="oem"
                code={group}
                rows={oems.filter((row) => row.unifiedCode === group && row.active)}
                canWrite={canWrite}
                onManage={openRelations}
              />
              <div className={styles.pager}>
                <Button
                  variant="outline"
                  disabled={groupCodes.indexOf(group) <= 0}
                  onClick={() =>
                    navigate('groups', groupCodes[groupCodes.indexOf(group) - 1] ?? '')
                  }
                >
                  <ArrowLeft className="size-3.5" />
                  {groupCodes[groupCodes.indexOf(group) - 1] ?? 'Anterior'}
                </Button>
                <Button
                  variant="outline"
                  disabled={groupCodes.indexOf(group) >= groupCodes.length - 1}
                  onClick={() =>
                    navigate('groups', groupCodes[groupCodes.indexOf(group) + 1] ?? '')
                  }
                >
                  {groupCodes[groupCodes.indexOf(group) + 1] ?? 'Siguiente'}
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </>
          )}
        </>
      ) : view === 'identifiers' ? (
        <IdentifiersPane
          product={selectedProduct}
          products={catalog}
          columns={catalogColumns}
          homologs={homologs}
          canWrite={canWrite}
          onSku={(value) => navigate('identifiers', '', value)}
          onGroup={(code) => navigate('groups', code)}
          onManage={openRelations}
        />
      ) : (
        <>
          <div className={styles.sticky}>
            <nav
              className={styles.tabs}
              role="tablist"
              aria-label="Vistas de Código Unificador y Homólogos"
            >
              {(
                [
                  ['groups', 'Códigos unificadores', groupCodes.length],
                  ['homologs', 'Homólogos', homologs.filter((row) => row.active).length],
                  ['oem', 'OEM', oems.filter((row) => row.active).length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  className={styles.tab}
                  role="tab"
                  aria-selected={view === key}
                  aria-controls="equivalences-table"
                  onClick={() => navigate(key)}
                >
                  {label} <span className={styles.count}>{count}</span>
                </button>
              ))}
            </nav>
            <div
              className={styles.actions}
              role="toolbar"
              aria-label={`Acciones de ${view === 'groups' ? 'Códigos unificadores' : kind === 'homologs' ? 'Homólogos' : 'Códigos OEM'}`}
            >
              {view !== 'groups' && canWrite ? (
                <Button
                  disabled={!canWrite || saving || !!activeDraft}
                  onClick={() => setDrafts((current) => ({ ...current, [kind]: newDraft() }))}
                  aria-label={kind === 'homologs' ? 'Agregar fila' : 'Agregar código OEM'}
                >
                  <Plus />
                  Nuevo
                </Button>
              ) : null}
              {canWrite ? (
                <Button
                  variant="outline"
                  disabled={
                    view === 'groups' ||
                    !canWrite ||
                    saving ||
                    !relationItems.some((row) => row.active && selected.has(row.id))
                  }
                  title={view === 'groups' ? 'Las asignaciones están gobernadas por AX' : undefined}
                  onClick={() =>
                    setDeleteRows(relationItems.filter((row) => row.active && selected.has(row.id)))
                  }
                >
                  <Trash2 />
                  Eliminar{selected.size ? ` (${selected.size})` : ''}
                </Button>
              ) : null}
              {view !== 'groups' && canWrite ? (
                <Button asChild variant="outline">
                  <Link href={`/imports?view=new&target=${kind}`}>
                    <Upload />
                    Importar
                  </Link>
                </Button>
              ) : canWrite ? (
                <Button
                  variant="outline"
                  disabled
                  title="Las asignaciones del código unificador llegan de AX"
                >
                  <Upload />
                  Importar
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={
                  view === 'groups'
                    ? !assignmentTable.visibleRows.length
                    : !relationTable.visibleRows.length
                }
                onClick={() => exportTable()}
              >
                <Download />
                Exportar Excel
              </Button>
              {canWrite ? (
                <Button variant="ghost" onClick={() => exportTable(true)}>
                  Plantilla
                </Button>
              ) : null}
              <Button
                variant="ghost"
                aria-label="Restaurar columnas"
                title="Restaurar orden de columnas"
                disabled={
                  view === 'groups' ? assignmentOrder.isDefaultOrder : relationOrder.isDefaultOrder
                }
                onClick={view === 'groups' ? assignmentOrder.resetOrder : relationOrder.resetOrder}
              >
                <Columns3 />
              </Button>
              <Button
                variant="ghost"
                aria-label="Actualizar relaciones"
                disabled={saving}
                onClick={() => setRevision((current) => current + 1)}
              >
                <RefreshCw />
              </Button>
              <label className={styles.search}>
                <span className="sr-only">
                  {view === 'groups' ? 'Buscar códigos unificadores' : 'Buscar en la tabla'}
                </span>
                <Input
                  type="search"
                  placeholder="Buscar en la tabla…"
                  value={queries[view] ?? ''}
                  onChange={(event) => setQueries({ ...queries, [view]: event.target.value })}
                />
              </label>
            </div>
          </div>
          {Object.entries(drafts).some(([key, draft]) => key !== view && draft) ? (
            <div className={styles.message}>
              Tienes una fila nueva sin completar en otra tabla. Se conserva hasta guardarla o
              descartarla.{' '}
              <button
                className="underline"
                onClick={() =>
                  navigate(
                    Object.keys(drafts).find(
                      (key) => key !== view && drafts[key as RelationKind],
                    ) as RelationKind,
                  )
                }
              >
                Ir a la fila
              </button>
            </div>
          ) : null}
          <section
            id="equivalences-table"
            className={styles.card}
            aria-label={
              view === 'groups'
                ? 'Asignaciones de códigos unificadores'
                : kind === 'homologs'
                  ? 'Tabla de Homólogos'
                  : 'Tabla de OEM'
            }
          >
            <div className={styles.cardHead}>
              <div>
                <h2>
                  {view === 'groups'
                    ? 'Códigos unificadores'
                    : kind === 'homologs'
                      ? 'Homólogos'
                      : 'Códigos OEM'}{' '}
                  ·{' '}
                  {view === 'groups'
                    ? assignmentTable.visibleRows.length
                    : relationTable.visibleRows.length}
                </h2>
                <p>
                  {view === 'groups'
                    ? `Una fila por SKU con su código unificador. Lo envía AX. ${groupCodes.length} códigos · ${assigned.length} SKU.`
                    : kind === 'homologs'
                      ? 'Códigos de otras marcas que CDR no vende, asociados a un código unificador: al buscarlos aparecen los SKU en tienda del grupo.'
                      : 'Números de pieza del fabricante del vehículo por código unificador. Solo códigos unificadores de tipo Automotriz.'}
                </p>
              </div>
              <div className={styles.legend}>
                <span>
                  <i />
                  Obligatorio sin valor
                </span>
                <span>
                  <i />
                  Editado en esta sesión
                </span>
              </div>
            </div>
            {view === 'groups' ? (
              <>
                <ExcelTableFilterBar
                  filteredColumns={assignmentTable.filteredColumnKeys.map(
                    (key) => assignmentColumns.find((column) => column.key === key)?.label ?? key,
                  )}
                  sort={
                    assignmentTable.sort
                      ? {
                          label:
                            assignmentColumns.find(
                              (column) => column.key === assignmentTable.sort?.key,
                            )?.label ?? '',
                          direction: assignmentTable.sort.direction,
                        }
                      : undefined
                  }
                  visibleCount={assignmentTable.visibleRows.length}
                  totalCount={assigned.length}
                  onClear={() => {
                    assignmentTable.clear();
                    setQueries({ ...queries, groups: '' });
                  }}
                />
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.check}>
                          <input
                            type="checkbox"
                            disabled
                            aria-label="Seleccionar asignaciones ERP"
                          />
                        </th>
                        {assignmentVisible.map((column) => (
                          <ExcelTableHeader
                            key={column.key}
                            columnKey={column.key}
                            label={column.label}
                            options={assignmentTable.getValueOptions(column.key)}
                            selectedValues={assignmentTable.filters[column.key]}
                            sortDirection={
                              assignmentTable.sort?.key === column.key
                                ? assignmentTable.sort.direction
                                : undefined
                            }
                            onFilterChange={(values) =>
                              assignmentTable.setColumnFilter(column.key, values)
                            }
                            onSort={(direction) => assignmentTable.setSort(column.key, direction)}
                            reorder={assignmentOrder.getColumnControl(column.key, column.label)}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentTable.visibleRows.map((row) => (
                        <tr key={row.id}>
                          <td className={styles.check}>
                            <input
                              type="checkbox"
                              disabled
                              aria-label={`Seleccionar ${row.product.sku}`}
                            />
                          </td>
                          {assignmentVisible.map((column) => (
                            <td
                              key={column.key}
                              className={styles.readOnly}
                              title={String(column.getValue(row) ?? '')}
                            >
                              {column.key === 'unifiedCode' ? (
                                <button
                                  className={styles.code}
                                  onClick={() => navigate('groups', row.product.unifiedCode ?? '')}
                                >
                                  {row.product.unifiedCode}
                                </button>
                              ) : column.key === 'sku' ? (
                                <Link className={styles.code} href={`/products/${row.product.id}`}>
                                  {row.product.sku}
                                </Link>
                              ) : column.key === 'group' ? (
                                <button
                                  className={styles.code}
                                  onClick={() => navigate('groups', row.product.unifiedCode ?? '')}
                                >
                                  {column.getValue(row)} SKU
                                </button>
                              ) : column.key === 'homologs' || column.key === 'oem' ? (
                                <button
                                  className={styles.code}
                                  onClick={() =>
                                    openRelations(
                                      column.key === 'homologs' ? 'homologs' : 'oem',
                                      row.product.unifiedCode ?? '',
                                    )
                                  }
                                >
                                  {column.getValue(row)}
                                </button>
                              ) : (
                                column.getValue(row) || '—'
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!assignmentTable.visibleRows.length ? (
                    <p className={styles.empty}>Sin asignaciones para esta búsqueda.</p>
                  ) : null}
                </div>
                <p className={styles.foot}>
                  <LockKeyhole className="mr-1 inline size-3" />
                  Solo lectura · ERP. El código unificador recibido de AX se conserva. No hay un
                  estado de sincronización registrado.
                </p>
              </>
            ) : (
              <>
                <ExcelTableFilterBar
                  filteredColumns={relationTable.filteredColumnKeys.map(
                    (key) => relationDefinitions.find((column) => column.key === key)?.label ?? key,
                  )}
                  sort={
                    relationTable.sort
                      ? {
                          label:
                            relationDefinitions.find(
                              (column) => column.key === relationTable.sort?.key,
                            )?.label ?? '',
                          direction: relationTable.sort.direction,
                        }
                      : undefined
                  }
                  visibleCount={relationTable.visibleRows.length}
                  totalCount={relationItems.filter((row) => includeInactive || row.active).length}
                  onClear={() => {
                    relationTable.clear();
                    setQueries({ ...queries, [kind]: '' });
                  }}
                />
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.check}>
                          <input
                            type="checkbox"
                            aria-label="Seleccionar todas las filas visibles"
                            disabled={!canWrite || saving}
                            checked={
                              relationTable.visibleRows.length > 0 &&
                              relationTable.visibleRows.every((row) => selected.has(row.id))
                            }
                            onChange={(event) =>
                              setSelected(
                                event.target.checked
                                  ? new Set(relationTable.visibleRows.map((row) => row.id))
                                  : new Set(),
                              )
                            }
                          />
                        </th>
                        {relationVisible.map((column) => (
                          <ExcelTableHeader
                            key={`${kind}:${column.key}`}
                            columnKey={column.key}
                            label={column.label + (column.required ? ' *' : '')}
                            options={relationTable.getValueOptions(column.key)}
                            selectedValues={relationTable.filters[column.key]}
                            sortDirection={
                              relationTable.sort?.key === column.key
                                ? relationTable.sort.direction
                                : undefined
                            }
                            onFilterChange={(values) =>
                              relationTable.setColumnFilter(column.key, values)
                            }
                            onSort={(direction) => relationTable.setSort(column.key, direction)}
                            reorder={relationOrder.getColumnControl(column.key, column.label)}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeDraft ? (
                        <tr className={styles.draft}>
                          <td className={styles.check}>
                            <button
                              disabled={saving}
                              aria-label="Descartar fila nueva"
                              onClick={() => {
                                if (
                                  [
                                    activeDraft.unifiedCode,
                                    activeDraft.code,
                                    activeDraft.brand,
                                  ].some(Boolean) &&
                                  !window.confirm('¿Descartar la fila nueva sin guardar?')
                                )
                                  return;
                                setDrafts((current) => ({ ...current, [kind]: undefined }));
                              }}
                            >
                              <X className="size-3.5" />
                            </button>
                          </td>
                          {relationVisible.map((column) => (
                            <td key={column.key}>
                              {column.key === 'unifiedCode' ||
                              column.key === 'code' ||
                              column.key === 'brand' ? (
                                <input
                                  autoFocus={column.key === 'unifiedCode'}
                                  aria-label={
                                    column.key === 'unifiedCode'
                                      ? 'Nuevo código unificador'
                                      : column.key === 'code'
                                        ? kind === 'homologs'
                                          ? 'Nuevo código externo'
                                          : 'Nuevo código OEM'
                                        : kind === 'homologs'
                                          ? 'Nueva marca externa'
                                          : 'Nuevas marcas OEM'
                                  }
                                  maxLength={
                                    column.key === 'unifiedCode'
                                      ? 120
                                      : column.key === 'code'
                                        ? 160
                                        : kind === 'oem'
                                          ? 2000
                                          : 160
                                  }
                                  value={activeDraft[column.key]}
                                  disabled={saving}
                                  onChange={(event) =>
                                    setDrafts({
                                      ...drafts,
                                      [kind]: { ...activeDraft, [column.key]: event.target.value },
                                    })
                                  }
                                />
                              ) : column.key === 'approvalStatus' ? (
                                <select
                                  aria-label="Aprobación de la fila nueva"
                                  value={activeDraft.approvalStatus}
                                  disabled={saving}
                                  onChange={(event) =>
                                    setDrafts({
                                      ...drafts,
                                      [kind]: {
                                        ...activeDraft,
                                        approvalStatus: event.target.value as HomologApprovalStatus,
                                      },
                                    })
                                  }
                                >
                                  {Object.entries(approvals).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              ) : column.key === 'origin' ? (
                                <Button
                                  disabled={saving}
                                  aria-label={
                                    kind === 'homologs'
                                      ? 'Guardar nuevo homólogo'
                                      : 'Guardar nuevo OEM'
                                  }
                                  onClick={() => void saveNew()}
                                >
                                  <Check className="size-3" />
                                  {saving ? 'Guardando…' : 'Guardar fila'}
                                </Button>
                              ) : null}
                            </td>
                          ))}
                        </tr>
                      ) : null}
                      {relationTable.visibleRows.map((row) => (
                        <tr
                          key={row.id}
                          className={
                            selected.has(row.id)
                              ? styles.selected
                              : saved.has(row.id)
                                ? 'bg-amber-50/40'
                                : ''
                          }
                        >
                          <td className={styles.check}>
                            <input
                              type="checkbox"
                              disabled={!canWrite || saving}
                              checked={selected.has(row.id)}
                              aria-label={`Seleccionar ${kind === 'homologs' ? 'homólogo' : 'OEM'} ${row.code}`}
                              onChange={() => toggle(row.id)}
                            />
                          </td>
                          {relationVisible.map((column) => (
                            <td
                              key={column.key}
                              className={
                                canWrite &&
                                row.active &&
                                ['code', 'brand', 'approvalStatus'].includes(column.key)
                                  ? styles.editable
                                  : styles.readOnly
                              }
                              title={String(relationValue(row, column.key) ?? '')}
                            >
                              {cell(row, column.key)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!relationTable.visibleRows.length && !activeDraft ? (
                    <p className={styles.empty}>
                      Sin registros para esta búsqueda.{' '}
                      {canWrite
                        ? 'Agrega uno con «Nuevo» o impórtalo con la plantilla.'
                        : 'Tu rol permite consultar.'}
                    </p>
                  ) : null}
                </div>
                <div className={styles.filters}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeInactive}
                      onChange={(event) => {
                        setIncludeInactive(event.target.checked);
                        setSelected(new Set());
                      }}
                    />
                    Mostrar inactivos
                  </label>
                  {includeInactive && canWrite ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        saving || !relationItems.some((row) => selected.has(row.id) && !row.active)
                      }
                      onClick={() => void applySelected(true)}
                    >
                      <RotateCcw className="size-3" />
                      Reactivar selección
                    </Button>
                  ) : null}
                </div>
                <p className={styles.foot}>
                  {canWrite ? (
                    <>
                      <strong>Clic en una celda</strong> para editar · se guarda al salir (Tab,
                      Enter o clic fuera) · Esc cancela · * obligatorio · columnas grises: solo
                      lectura.
                    </>
                  ) : (
                    'Tu rol solo consulta. Las columnas grises son de solo lectura.'
                  )}{' '}
                  {kind === 'homologs'
                    ? 'Fuente, nombre, tipo de referencia y observación no tienen datos registrados.'
                    : 'La fuente comercial no tiene datos registrados.'}{' '}
                  Solo las relaciones activas y aprobadas participan en la búsqueda.
                </p>
              </>
            )}
          </section>
        </>
      )}
      {deleteRows ? (
        <WorkspaceDrawer
          title="Eliminar selección"
          onClose={() => {
            if (!saving) setDeleteRows(null);
          }}
          busy={saving}
        >
          <p className="text-sm">
            Se desactivarán {deleteRows.length} {kind === 'homologs' ? 'homólogos' : 'códigos OEM'}.
            La búsqueda dejará de encontrar estas relaciones. Los SKU conservan su identidad.
          </p>
          <ul className="my-4 list-disc pl-5 text-sm">
            {deleteRows.map((row) => (
              <li key={row.id}>
                {row.code} · {row.brand} · {row.unifiedCode}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setDeleteRows(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={saving} onClick={() => void applySelected()}>
              {saving ? 'Eliminando…' : 'Confirmar eliminación'}
            </Button>
          </div>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}

function GroupRelations({
  kind,
  code,
  rows,
  canWrite,
  onManage,
}: {
  kind: RelationKind;
  code: string;
  rows: EquivalenceRelation[];
  canWrite: boolean;
  onManage: (kind: RelationKind, code: string, create?: boolean) => void;
}) {
  const title = kind === 'homologs' ? 'Homólogos' : 'Códigos OEM';
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h2>
            {title} de {code} · {rows.length}
          </h2>
          <p>
            {kind === 'homologs'
              ? 'Códigos de otras marcas que no se venden en tienda, asociados una vez al grupo.'
              : 'Números de pieza del fabricante del vehículo por código unificador.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button size="sm" onClick={() => onManage(kind, code, true)}>
              <Plus className="size-3" />
              Agregar {kind === 'homologs' ? 'homólogo' : 'OEM'}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => onManage(kind, code)}>
            Gestionar
          </Button>
        </div>
      </div>
      <div className={`${styles.pane} ${styles.chips}`}>
        {rows.length ? (
          rows.map((row) => (
            <span key={row.id} className={styles.chip}>
              <strong>{row.brand}</strong>
              {row.code}
              <StatusBadge tone={row.approvalStatus === 'approved' ? 'success' : 'warning'}>
                {approvals[row.approvalStatus]}
              </StatusBadge>
            </span>
          ))
        ) : (
          <p>Sin {title.toLocaleLowerCase('es')} registrados para este código unificador.</p>
        )}
      </div>
    </section>
  );
}

function IdentifiersPane({
  product,
  products,
  columns,
  homologs,
  canWrite,
  onSku,
  onGroup,
  onManage,
}: {
  product: CatalogWorkbookProductDto | undefined;
  products: CatalogWorkbookProductDto[];
  columns: CatalogWorkbookColumnDto[];
  homologs: EquivalenceRelation[];
  canWrite: boolean;
  onSku: (sku: string) => void;
  onGroup: (code: string) => void;
  onManage: (kind: RelationKind, code: string, create?: boolean) => void;
}) {
  if (!product)
    return (
      <StatePanel
        variant="empty"
        title="Sin productos registrados"
        description="Los identificadores estarán disponibles cuando AX envíe productos al PIM."
      />
    );
  const identifiers = [
    {
      key: 'sku',
      label: 'Código artículo · identidad',
      value: product.sku,
      source: 'ERP · Sismetic / AX',
      erp: true,
      editable: false,
      origin: 'ERP',
    },
    {
      key: 'provider',
      label: 'Código de proveedor',
      value: product.providerCode,
      source: 'ERP · Sismetic / AX',
      erp: true,
      editable: false,
      origin: 'ERP',
    },
    {
      key: 'unified',
      label: 'Código unificador',
      value: product.unifiedCode,
      source: 'ERP · Sismetic / AX',
      erp: true,
      editable: false,
      origin: 'ERP',
    },
    ...columns
      .filter(
        (column) =>
          /^(codigo_?ean|ean|oem|codigo_?oem|codigo_?fmsi|fmsi|upc)$/iu.test(column.key) &&
          product.attributes[column.key]?.applicable,
      )
      .map((column) => {
        const cell = product.attributes[column.key];
        return {
          key: column.key,
          label: column.label,
          value: cell?.applicable ? cell.value : null,
          source:
            column.sourceAuthority === 'erp'
              ? 'ERP · Sismetic / AX'
              : column.sourceAuthority === 'supplier'
                ? 'Proveedor'
                : column.sourceAuthority === 'calculated'
                  ? 'Calculado'
                  : 'Plantilla del PIM',
          erp: column.sourceAuthority === 'erp',
          editable: column.sourceAuthority === 'pim' && column.permissions.edit,
          origin: cell?.applicable
            ? {
                manual: 'Manual',
                erp: 'ERP',
                import: 'Importación',
                document_extraction: 'Extracción documental',
                ai_generated: 'IA',
              }[cell.source]
            : 'Sin registro',
        };
      }),
  ];
  const related = product.unifiedCode
    ? relationGroupMembers(product.unifiedCode, products).filter(
        (candidate) => candidate.id !== product.id,
      )
    : [];
  const external = homologs.filter((row) => row.unifiedCode === product.unifiedCode && row.active);
  return (
    <>
      <div className={styles.skuBar}>
        <label>
          SKU en contexto{' '}
          <select
            aria-label="SKU en contexto"
            value={product.sku}
            onChange={(event) => onSku(event.target.value)}
          >
            {products.map((item) => (
              <option key={item.id} value={item.sku}>
                {item.sku} · {item.brand ?? 'Sin marca'}
              </option>
            ))}
          </select>
        </label>
        <Link className={styles.code} href={`/products/${product.id}`}>
          Ver ficha
        </Link>
      </div>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2>Identificadores del SKU · {identifiers.length}</h2>
            <p>Identidad base de ERP y atributos identificadores de la plantilla activa.</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {[
                  'Tipo',
                  'Valor',
                  'Marca / fabricante',
                  'Fuente',
                  'Vigencia',
                  'Origen',
                  'Acción',
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {identifiers.map((identifier) => (
                <tr key={identifier.key}>
                  <td>
                    <strong>{identifier.label}</strong>
                  </td>
                  <td>
                    {identifier.value === null ||
                    identifier.value === undefined ||
                    identifier.value === ''
                      ? 'Pendiente'
                      : String(identifier.value)}
                  </td>
                  <td>{product.brand ?? '—'}</td>
                  <td>{identifier.source}</td>
                  <td>
                    <StatusBadge
                      tone={
                        identifier.value !== null &&
                        identifier.value !== undefined &&
                        String(identifier.value).trim() !== ''
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {identifier.value !== null &&
                      identifier.value !== undefined &&
                      String(identifier.value).trim() !== ''
                        ? 'Vigente'
                        : 'Pendiente'}
                    </StatusBadge>
                  </td>
                  <td>{identifier.origin}</td>
                  <td>
                    {!identifier.editable ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <LockKeyhole className="size-3" />
                        {identifier.erp ? 'Solo lectura · ERP' : 'Solo lectura'}
                      </span>
                    ) : (
                      <Link className={styles.code} href={`/products/${product.id}`}>
                        {canWrite ? 'Editar en enriquecimiento' : 'Ver en ficha'}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.foot}>
          Los identificadores base llegan de ERP y se conservan. EAN, OEM y FMSI solo aparecen si la
          plantilla activa los define.
        </p>
      </section>
      <div className={styles.twocol}>
        <section className={`${styles.card} ${styles.pane}`}>
          <h2>
            Homólogos del código unificador{product.unifiedCode ? ` ${product.unifiedCode}` : ''} ·{' '}
            {external.length}
          </h2>
          {!product.unifiedCode ? (
            <p>
              Este SKU no tiene código unificador. Los homólogos se registran por código unificador.
            </p>
          ) : external.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {['Marca', 'Código homólogo', 'Nombre', 'Fuente', 'Estado', 'Acción'].map(
                      (label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {external.map((row) => (
                    <tr key={row.id}>
                      <td>{row.brand}</td>
                      <td>{row.code}</td>
                      <td>
                        <span className={styles.unavailable}>—</span>
                      </td>
                      <td>{row.source === 'import' ? 'Importación' : 'Manual'}</td>
                      <td>
                        <StatusBadge
                          tone={
                            row.approvalStatus === 'approved'
                              ? 'success'
                              : row.approvalStatus === 'rejected'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {approvals[row.approvalStatus]}
                        </StatusBadge>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onManage('homologs', product.unifiedCode!)}
                        >
                          {canWrite ? 'Editar en la tabla' : 'Ver en la tabla'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              Sin homólogos para {product.unifiedCode}. Un homólogo es el código de otra marca que
              no se vende en tienda.
            </p>
          )}
          {product.unifiedCode ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {canWrite ? (
                <Button size="sm" onClick={() => onManage('homologs', product.unifiedCode!, true)}>
                  Agregar homólogo
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onManage('homologs', product.unifiedCode!)}
              >
                Gestionar en la tabla
              </Button>
            </div>
          ) : null}
        </section>
        <section className={`${styles.card} ${styles.pane}`}>
          <h2>Relacionados en tienda</h2>
          <p>
            {product.unifiedCode
              ? `SKU agrupados por AX con ${product.unifiedCode}. No son homólogos: sí se venden.`
              : 'Sin código unificador: AX no agrupó este SKU con otros.'}
          </p>
          {related.length ? (
            <div className="mt-3 divide-y">
              {related.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <strong>
                    {item.brand} · {item.sku}
                  </strong>
                  <Link className={styles.code} href={`/products/${item.id}`}>
                    Ver ficha
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3">Sin otros SKU en el grupo.</p>
          )}
          {product.unifiedCode ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => onGroup(product.unifiedCode!)}
            >
              Ver grupo
            </Button>
          ) : null}
        </section>
      </div>
    </>
  );
}
