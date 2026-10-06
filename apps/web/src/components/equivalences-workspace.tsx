'use client';

import type {
  ExternalHomologDto,
  HomologApprovalStatus,
  HomologSearchResultDto,
} from '@cdr/contracts';
import {
  Boxes,
  CheckCircle2,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceData } from '@/components/use-workspace-data';
import {
  createHomolog,
  listHomologs,
  searchEligibleHomologs,
  updateHomolog,
} from '@/lib/operational-api';
import { formatWorkspaceCell, formatWorkspaceMetric } from '@/lib/workspace-view';

interface HomologForm {
  unifiedCode: string;
  externalCode: string;
  externalBrand: string;
  approvalStatus: HomologApprovalStatus;
}

const emptyForm: HomologForm = {
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

export function EquivalencesWorkspace({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<ExternalHomologDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HomologForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [eligibleQuery, setEligibleQuery] = useState('');
  const [eligibleResults, setEligibleResults] = useState<HomologSearchResultDto[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<'groups' | 'homologs' | 'identifiers'>('groups');
  const [identifierGroupId, setIdentifierGroupId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const groups = useWorkspaceData('equivalences');

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    if (requested === 'homologs' || requested === 'identifiers') setView(requested);
  }, []);

  const changeView = (next: 'groups' | 'homologs' | 'identifiers') => {
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
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar equivalencias.',
      );
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    if (!normalized) return items;
    return items.filter((item) =>
      [item.unifiedCode, item.externalCode, item.externalBrand, item.approvalStatus].some((value) =>
        value.toLocaleLowerCase('es').includes(normalized),
      ),
    );
  }, [items, query]);
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
  const selectedGroup = groupRows.find((row) => row.id === selectedGroupId);
  const effectiveIdentifierGroupId = identifierGroupId || groupRows[0]?.id || '';
  const identifierGroup = groupRows.find((row) => row.id === effectiveIdentifierGroupId);
  const identifierCode = String(identifierGroup?.values.code ?? '');
  const memberSkus = String(identifierGroup?.values.skus ?? '')
    .split(',')
    .map((sku) => sku.trim())
    .filter(Boolean);
  const groupHomologs = items.filter((item) => item.unifiedCode === identifierCode);

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateHomolog(editingId, {
          externalCode: form.externalCode,
          externalBrand: form.externalBrand,
          approvalStatus: form.approvalStatus,
        });
        setNotice('Homólogo actualizado. La búsqueda respetará su estado y aprobación.');
      } else {
        await createHomolog({ ...form, active: true });
        setNotice('Homólogo creado correctamente.');
      }
      closeForm();
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible guardar el homólogo.',
      );
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (item: ExternalHomologDto, active: boolean) => {
    try {
      await updateHomolog(item.id, { active });
      setNotice(
        active ? 'Homólogo reactivado.' : 'Homólogo desactivado sin eliminar su historial.',
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible cambiar el estado.',
      );
    }
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

  return (
    <>
      <PageHeader
        eyebrow="Relaciones de producto"
        title="Código unificador y equivalencias"
        description="Códigos unificadores recibidos desde ERP y homólogos externos asociados para ampliar la búsqueda."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw
                aria-hidden="true"
                className={loading ? 'size-4 animate-spin' : 'size-4'}
              />
              Actualizar
            </Button>
            {canWrite ? (
              <Button
                onClick={() => {
                  closeForm();
                  setShowForm(true);
                }}
              >
                <Plus aria-hidden="true" className="size-4" />
                Nuevo homólogo
              </Button>
            ) : null}
          </>
        }
      />
      <ScreenGuide
        objective="Presenta dos relaciones distintas: el código unificador agrupa SKU sin fusionarlos; los homólogos enlazan códigos externos para que la búsqueda los encuentre."
        actions={[
          'Registra el código, la marca externa y su estado de aprobación.',
          'Desactiva relaciones obsoletas sin borrarlas físicamente.',
          'Usa la búsqueda de elegibilidad para confirmar qué productos devuelve un código externo.',
        ]}
        dataSource="La tabla y la búsqueda se conectan a los endpoints de equivalencias del backend."
        limitation="La expansión hacia productos solo considera homólogos simultáneamente activos y aprobados."
      />

      <nav className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Vistas de equivalencias">
        <button
          type="button"
          onClick={() => changeView('groups')}
          className={`rounded-xl border p-4 text-left ${view === 'groups' ? 'border-primary bg-orange-50/50 ring-1 ring-primary' : 'bg-white'}`}
        >
          <strong className="text-sm">Códigos unificadores</strong>
          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-primary">
            {groups.workspace?.totalRows ?? '—'}
          </span>
          <small className="mt-1 block text-muted-foreground">
            Agrupan SKU sin perder su identidad · lectura ERP
          </small>
        </button>
        <button
          type="button"
          onClick={() => changeView('homologs')}
          className={`rounded-xl border p-4 text-left ${view === 'homologs' ? 'border-primary bg-orange-50/50 ring-1 ring-primary' : 'bg-white'}`}
        >
          <strong className="text-sm">Homólogos</strong>
          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-primary">
            {items.length}
          </span>
          <small className="mt-1 block text-muted-foreground">
            Códigos de otras marcas asociados al grupo
          </small>
        </button>
        <button
          type="button"
          onClick={() => changeView('identifiers')}
          className={`rounded-xl border p-4 text-left ${view === 'identifiers' ? 'border-primary bg-orange-50/50 ring-1 ring-primary' : 'bg-white'}`}
        >
          <strong className="text-sm">Identificadores</strong>
          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-primary">
            {identifierGroup ? 1 + memberSkus.length + groupHomologs.length : '—'}
          </span>
          <small className="mt-1 block text-muted-foreground">
            Código unificador, SKU miembros y códigos externos
          </small>
        </button>
      </nav>

      {groups.workspace ? (
        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen">
          {groups.workspace.metrics.slice(0, 4).map((metric, index) => {
            const Icon = index % 2 === 0 ? Boxes : CheckCircle2;
            return (
              <Card key={metric.key} className="flex min-h-28 items-start gap-3 p-5">
                <span className="grid size-9 place-items-center rounded-full bg-orange-100 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <small className="text-muted-foreground">{metric.label}</small>
                  <strong className="mt-1 block text-2xl">{formatWorkspaceMetric(metric)}</strong>
                </span>
              </Card>
            );
          })}
        </section>
      ) : null}

      <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-950">
        <strong>Una ficha por SKU.</strong> El código unificador permite compartir atributos y
        aplicaciones, pero no fusiona productos. La búsqueda por homólogo solo usa relaciones
        activas y aprobadas.
      </div>

      {view === 'groups' ? (
        groups.loading ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : groups.error ? (
          <StatePanel
            variant="error"
            title="No fue posible cargar los grupos"
            description={groups.error}
            actionLabel="Reintentar"
            onAction={groups.reload}
          />
        ) : groups.workspace ? (
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="border-b p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      Códigos unificadores · {filteredGroups.length} de {groups.workspace.totalRows}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cada fila proviene de los grupos y membresías persistidos en PostgreSQL.
                    </p>
                  </div>
                  <label className="relative block w-full max-w-sm">
                    <span className="sr-only">Buscar grupos</span>
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
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                    <tr>
                      {groups.workspace.columns.map((column) => (
                        <th key={column.key} className="px-4 py-3">
                          {column.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredGroups.map((row) => (
                      <tr key={row.id} className="hover:bg-orange-50/40">
                        {groups.workspace?.columns.map((column) => (
                          <td key={column.key} className="px-4 py-3">
                            {formatWorkspaceCell(row.values[column.key], column)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedGroupId(row.id)}
                          >
                            Ver grupo
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {selectedGroup ? (
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
                      Grupo en contexto
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      {String(selectedGroup.values.code)} · {String(selectedGroup.values.name)}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(selectedGroup.values.members)} miembros · tipo{' '}
                      {String(selectedGroup.values.kind)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIdentifierGroupId(selectedGroup.id);
                      changeView('identifiers');
                    }}
                  >
                    Ver identificadores
                  </Button>
                </div>
                <div className="mt-4 rounded-lg border bg-slate-50 p-3 text-xs">
                  <strong className="block text-cdr-ink">SKU miembros</strong>
                  <span className="mt-1 block break-words text-muted-foreground">
                    {String(selectedGroup.values.skus || 'Sin miembros')}
                  </span>
                </div>
              </Card>
            ) : null}
          </div>
        ) : null
      ) : view === 'identifiers' ? (
        groups.loading ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : groups.error ? (
          <StatePanel
            variant="error"
            title="No fue posible cargar los identificadores"
            description={groups.error}
            actionLabel="Reintentar"
            onAction={groups.reload}
          />
        ) : identifierGroup ? (
          <div className="space-y-5">
            <Card className="grid gap-4 p-5 lg:grid-cols-[minmax(280px,.7fr)_minmax(0,1.3fr)] lg:items-end">
              <Select
                label="Código unificador en contexto"
                value={effectiveIdentifierGroupId}
                onChange={(event) => setIdentifierGroupId(event.target.value)}
              >
                {groupRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.values.code)} · {String(row.values.members)} SKU
                  </option>
                ))}
              </Select>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
                Los identificadores mostrados existen en las proyecciones persistidas. EAN, OEM y
                FMSI se consultan en la ficha del SKU cuando su plantilla los define.
              </div>
            </Card>
            <Card className="overflow-hidden">
              <div className="border-b p-5">
                <h2 className="font-semibold">Identificadores del grupo · {identifierCode}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  El grupo relaciona identidades sin fusionar las fichas de producto.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Marca</th>
                      <th className="px-4 py-3">Fuente</th>
                      <th className="px-4 py-3">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-4 py-3 font-semibold">Código unificador</td>
                      <td className="px-4 py-3 font-mono">{identifierCode}</td>
                      <td className="px-4 py-3">—</td>
                      <td className="px-4 py-3">ERP / grupo persistido</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone="success">Vigente</StatusBadge>
                      </td>
                    </tr>
                    {memberSkus.map((sku) => (
                      <tr key={`sku:${sku}`}>
                        <td className="px-4 py-3 font-semibold">Código artículo</td>
                        <td className="px-4 py-3 font-mono">{sku}</td>
                        <td className="px-4 py-3">—</td>
                        <td className="px-4 py-3">Membresía persistida</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone="success">Vigente</StatusBadge>
                        </td>
                      </tr>
                    ))}
                    {groupHomologs.map((homolog) => (
                      <tr key={`homolog:${homolog.id}`}>
                        <td className="px-4 py-3 font-semibold">Código homólogo</td>
                        <td className="px-4 py-3 font-mono">{homolog.externalCode}</td>
                        <td className="px-4 py-3">{homolog.externalBrand}</td>
                        <td className="px-4 py-3">
                          {homolog.source === 'import' ? 'Importación' : 'Manual'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              homolog.active && homolog.approvalStatus === 'approved'
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {homolog.active ? approvalLabels[homolog.approvalStatus] : 'Inactivo'}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : (
          <StatePanel
            variant="empty"
            title="Sin identificadores"
            description="No hay grupos persistidos para construir el contexto de identificadores."
          />
        )
      ) : (
        <>
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

          <Card className="mb-5 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Link2 aria-hidden="true" className="size-5 text-primary" />
              <h2 className="font-semibold">Búsqueda por homólogo elegible</h2>
            </div>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={runEligibleSearch}>
              <Input
                value={eligibleQuery}
                onChange={(e) => setEligibleQuery(e.target.value)}
                placeholder="Código externo exacto"
                aria-label="Código externo exacto"
              />
              <Button type="submit" disabled={searching || !eligibleQuery.trim()}>
                <Search aria-hidden="true" className="size-4" />
                {searching ? 'Buscando…' : 'Buscar'}
              </Button>
            </form>
            {eligibleResults ? (
              <div className="mt-4">
                {eligibleResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No existe un homólogo activo y aprobado para ese código.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {eligibleResults.map((result) => (
                      <li
                        key={result.homolog.id}
                        className="rounded-lg border bg-slate-50 p-3 text-sm"
                      >
                        <strong>
                          {result.homolog.externalBrand} · {result.homolog.externalCode}
                        </strong>
                        <span className="ml-2 text-muted-foreground">
                          → {result.homolog.unifiedCode}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          SKU:{' '}
                          {result.products.map((product) => product.sku).join(', ') ||
                            'sin productos activos'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </Card>

          {showForm ? (
            <Card className="mb-5 p-5">
              <form onSubmit={submit}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {editingId ? 'Editar homólogo' : 'Nuevo homólogo'}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={closeForm}
                    aria-label="Cerrar"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Código unificador
                    <Input
                      required
                      disabled={Boolean(editingId)}
                      value={form.unifiedCode}
                      onChange={(e) =>
                        setForm((value) => ({ ...value, unifiedCode: e.target.value }))
                      }
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Código externo
                    <Input
                      required
                      value={form.externalCode}
                      onChange={(e) =>
                        setForm((value) => ({ ...value, externalCode: e.target.value }))
                      }
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Marca externa
                    <Input
                      required
                      value={form.externalBrand}
                      onChange={(e) =>
                        setForm((value) => ({ ...value, externalBrand: e.target.value }))
                      }
                    />
                  </label>
                  <Select
                    label="Aprobación"
                    value={form.approvalStatus}
                    onChange={(e) =>
                      setForm((value) => ({
                        ...value,
                        approvalStatus: e.target.value as HomologApprovalStatus,
                      }))
                    }
                  >
                    <option value="pending">Pendiente</option>
                    <option value="approved">Aprobado</option>
                    <option value="rejected">Rechazado</option>
                  </Select>
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
            <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Buscar en la tabla
                <span className="relative block">
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Código, marca o estado"
                  />
                </span>
              </label>
              <label className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                Mostrar inactivos
              </label>
            </div>
          </Card>

          {loading ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : filtered.length === 0 ? (
            <StatePanel
              variant="empty"
              title="Sin equivalencias"
              description="No hay homólogos que coincidan con la búsqueda."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Código unificador</th>
                      <th className="px-4 py-3">Código externo</th>
                      <th className="px-4 py-3">Marca</th>
                      <th className="px-4 py-3">Aprobación</th>
                      <th className="px-4 py-3">Origen</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-orange-50/40">
                        <td className="px-4 py-3 font-semibold">{item.unifiedCode}</td>
                        <td className="px-4 py-3">{item.externalCode}</td>
                        <td className="px-4 py-3">{item.externalBrand}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              item.approvalStatus === 'approved'
                                ? 'success'
                                : item.approvalStatus === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {approvalLabels[item.approvalStatus]}
                          </StatusBadge>
                        </td>
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
                                    setForm({
                                      unifiedCode: item.unifiedCode,
                                      externalCode: item.externalCode,
                                      externalBrand: item.externalBrand,
                                      approvalStatus: item.approvalStatus,
                                    });
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
