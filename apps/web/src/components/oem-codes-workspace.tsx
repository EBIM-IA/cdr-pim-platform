'use client';

import type { GroupOemCodeDto, OemApprovalStatus, OemSearchResultDto } from '@cdr/contracts';
import { Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
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

interface OemForm {
  unifiedCode: string;
  oemCode: string;
  brands: string;
  approvalStatus: OemApprovalStatus;
}

const emptyForm: OemForm = {
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
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OemForm>(emptyForm);
  const [saving, setSaving] = useState(false);
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
    return items.filter((item) =>
      [item.unifiedCode, item.oemCode, ...item.brands, item.approvalStatus].some((value) =>
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
    const brands = form.brands
      .split(',')
      .map((brand) => brand.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const current = items.find((item) => item.id === editingId);
        if (!current)
          throw new Error('El código OEM cambió; actualiza la lista e inténtalo de nuevo.');
        await updateOemCode(editingId, {
          expectedUpdatedAt: current.updatedAt,
          oemCode: form.oemCode,
          brands,
          approvalStatus: form.approvalStatus,
        });
        setNotice('Código OEM actualizado.');
      } else {
        await createOemCode({ ...form, brands, active: true });
        setNotice('Código OEM creado para el grupo automotriz.');
      }
      closeForm();
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible guardar OEM.',
      );
    } finally {
      setSaving(false);
    }
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

  const edit = (item: GroupOemCodeDto) => {
    setEditingId(item.id);
    setForm({
      unifiedCode: item.unifiedCode,
      oemCode: item.oemCode,
      brands: item.brands.join(', '),
      approvalStatus: item.approvalStatus,
    });
    setShowForm(true);
  };

  const setActive = async (item: GroupOemCodeDto, active: boolean) => {
    setError(null);
    try {
      if (active) {
        await updateOemCode(item.id, { active: true, expectedUpdatedAt: item.updatedAt });
      } else {
        await deactivateOemCode(item.id, item.updatedAt);
      }
      setNotice(active ? 'Código OEM reactivado.' : 'Código OEM desactivado.');
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cambiar el estado OEM.',
      );
    }
  };

  return (
    <div className="space-y-5">
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

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Búsqueda OEM elegible</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Solo devuelve relaciones activas y aprobadas de grupos automotrices.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw
                className={loading ? 'size-4 animate-spin' : 'size-4'}
                aria-hidden="true"
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
                <Plus className="size-4" aria-hidden="true" />
                Nuevo OEM
              </Button>
            ) : null}
          </div>
        </div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={runEligibleSearch}>
          <Input
            value={eligibleQuery}
            onChange={(event) => setEligibleQuery(event.target.value)}
            placeholder="Código OEM exacto o marca"
            aria-label="Código OEM o marca"
          />
          <Button type="submit" disabled={searching || !eligibleQuery.trim()}>
            <Search className="size-4" aria-hidden="true" />
            {searching ? 'Buscando…' : 'Buscar'}
          </Button>
        </form>
        {eligibleResults ? (
          <div className="mt-4 space-y-2">
            {eligibleResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay coincidencias OEM activas y aprobadas.
              </p>
            ) : (
              eligibleResults.map((result) => (
                <div key={result.oem.id} className="rounded-lg border bg-slate-50 p-3 text-sm">
                  <strong>{result.oem.oemCode}</strong>
                  <span className="ml-2 text-muted-foreground">
                    {result.oem.brands.join(', ')} → {result.oem.unifiedCode}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    SKU:{' '}
                    {result.products.map((product) => product.sku).join(', ') || 'sin productos'}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : null}
      </Card>

      {showForm ? (
        <Card className="p-5">
          <form onSubmit={submit}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">
                {editingId ? 'Editar código OEM' : 'Nuevo código OEM'}
              </h2>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={closeForm}
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Código unificador
                <Input
                  required
                  disabled={Boolean(editingId)}
                  value={form.unifiedCode}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, unifiedCode: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Código OEM
                <Input
                  required
                  value={form.oemCode}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, oemCode: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Marcas (separadas por coma)
                <Input
                  required
                  value={form.brands}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, brands: event.target.value }))
                  }
                />
              </label>
              <Select
                label="Aprobación"
                value={form.approvalStatus}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    approvalStatus: event.target.value as OemApprovalStatus,
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

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Buscar en la tabla
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Código OEM, unificador, marca o estado"
            />
          </label>
          <label className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
            Mostrar inactivos
          </label>
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : filtered.length === 0 ? (
        <StatePanel
          variant="empty"
          title="Sin códigos OEM"
          description="No hay relaciones OEM que coincidan con los filtros."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Código unificador</th>
                  <th className="px-4 py-3">Código OEM</th>
                  <th className="px-4 py-3">Marcas</th>
                  <th className="px-4 py-3">Aprobación</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold">{item.unifiedCode}</td>
                    <td className="px-4 py-3 font-mono">{item.oemCode}</td>
                    <td className="px-4 py-3">{item.brands.join(', ')}</td>
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
                        {labels[item.approvalStatus]}
                      </StatusBadge>
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
                            <Button size="sm" variant="ghost" onClick={() => edit(item)}>
                              <Pencil className="size-4" />
                              Editar
                            </Button>
                            {item.active ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void setActive(item, false)}
                              >
                                <Trash2 className="size-4" />
                                Desactivar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void setActive(item, true)}
                              >
                                <RotateCcw className="size-4" />
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
    </div>
  );
}
