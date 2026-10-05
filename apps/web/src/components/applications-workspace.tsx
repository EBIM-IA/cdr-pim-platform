'use client';

import type { GroupApplicationDto } from '@cdr/contracts';
import { Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  createApplication,
  deactivateApplication,
  listApplications,
  updateApplication,
} from '@/lib/operational-api';

interface ApplicationForm {
  unifiedCode: string;
  vehicleType: string;
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

export function ApplicationsWorkspace({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<GroupApplicationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [saving, setSaving] = useState(false);

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
    if (!normalized) return items;
    return items.filter((item) =>
      [item.unifiedCode, item.vehicleType, item.make, item.model, item.engine, item.notes]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('es').includes(normalized)),
    );
  }, [items, query]);

  const updateField = (field: keyof ApplicationForm, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

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
        await updateApplication(editingId, fields);
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

  const setActive = async (item: GroupApplicationDto, active: boolean) => {
    setError(null);
    try {
      if (active) await updateApplication(item.id, { active: true });
      else await deactivateApplication(item.id);
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
        description="Gestiona compatibilidades heredadas por todos los SKU del mismo código unificador."
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
                <Plus aria-hidden="true" className="size-4" /> Nueva aplicación
              </Button>
            ) : null}
          </>
        }
      />
      <ScreenGuide
        objective="Consulta y mantiene las aplicaciones técnicas asociadas al código unificador, no a un SKU aislado."
        actions={[
          'Busca por código, marca, modelo, motor o notas.',
          'Crea o edita compatibilidades si tu rol cuenta con permiso de escritura.',
          'Desactiva registros sin eliminar su trazabilidad y vuelve a activarlos cuando corresponda.',
        ]}
        dataSource="Los registros se leen y escriben en el API de aplicaciones. Cada cambio genera auditoría en el backend."
        limitation="El código unificador debe existir previamente; una aplicación no puede asociarse a un código desconocido."
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

      {showForm ? (
        <Card className="mb-5 p-5">
          <form onSubmit={submit}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {editingId ? 'Editar aplicación' : 'Nueva aplicación'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Los campos vacíos se guardan como no informados.
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
                Tipo de vehículo
                <Input
                  value={form.vehicleType}
                  onChange={(e) => updateField('vehicleType', e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Marca
                <Input value={form.make} onChange={(e) => updateField('make', e.target.value)} />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Modelo
                <Input value={form.model} onChange={(e) => updateField('model', e.target.value)} />
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
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
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
          <label className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />{' '}
            Mostrar inactivos
          </label>
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : filtered.length === 0 ? (
        <StatePanel
          variant="empty"
          title="Sin aplicaciones"
          description="No hay registros que coincidan con la búsqueda y el estado seleccionados."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Marca / modelo</th>
                  <th className="px-4 py-3">Años</th>
                  <th className="px-4 py-3">Motor</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-orange-50/40">
                    <td className="px-4 py-3 font-semibold">{item.unifiedCode}</td>
                    <td className="px-4 py-3">{item.vehicleType ?? '—'}</td>
                    <td className="px-4 py-3">
                      {[item.make, item.model].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {item.yearFrom || item.yearTo
                        ? `${item.yearFrom ?? '…'}–${item.yearTo ?? '…'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">{item.engine ?? '—'}</td>
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
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
