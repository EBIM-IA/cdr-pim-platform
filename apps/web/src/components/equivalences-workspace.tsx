'use client';

import type {
  ExternalHomologDto,
  HomologApprovalStatus,
  HomologSearchResultDto,
} from '@cdr/contracts';
import { Link2, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
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
import {
  createHomolog,
  listHomologs,
  searchEligibleHomologs,
  updateHomolog,
} from '@/lib/operational-api';

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
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HomologForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [eligibleQuery, setEligibleQuery] = useState('');
  const [eligibleResults, setEligibleResults] = useState<HomologSearchResultDto[] | null>(null);
  const [searching, setSearching] = useState(false);

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
        title="Equivalencias"
        description="Administra homólogos externos y consulta únicamente relaciones activas y aprobadas."
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
        objective="Relaciona códigos externos con un código unificador y permite verificar qué SKU son recuperables por un homólogo elegible."
        actions={[
          'Registra el código, la marca externa y su estado de aprobación.',
          'Desactiva relaciones obsoletas sin borrarlas físicamente.',
          'Usa la búsqueda de elegibilidad para confirmar qué productos devuelve un código externo.',
        ]}
        dataSource="La tabla y la búsqueda se conectan a los endpoints de equivalencias del backend."
        limitation="La expansión hacia productos solo considera homólogos simultáneamente activos y aprobados."
      />

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
                  <li key={result.homolog.id} className="rounded-lg border bg-slate-50 p-3 text-sm">
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
                  onChange={(e) => setForm((value) => ({ ...value, unifiedCode: e.target.value }))}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Código externo
                <Input
                  required
                  value={form.externalCode}
                  onChange={(e) => setForm((value) => ({ ...value, externalCode: e.target.value }))}
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
  );
}
