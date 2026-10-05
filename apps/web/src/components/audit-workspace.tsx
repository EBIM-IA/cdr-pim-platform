'use client';

import type { AuditChangeDto, AuditChangeListQuery } from '@cdr/contracts';
import { ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { listAuditChanges } from '@/lib/operational-api';

interface AuditFilters {
  sku: string;
  field: string;
  source: string;
  actorId: string;
  from: string;
  to: string;
}

const emptyFilters: AuditFilters = {
  sku: '',
  field: '',
  source: '',
  actorId: '',
  from: '',
  to: '',
};

const actionLabels: Record<AuditChangeDto['action'], string> = {
  created: 'Creación',
  updated: 'Actualización',
  deleted: 'Desactivación',
  published: 'Publicación',
  imported: 'Importación',
  ai_generated: 'Generación IA',
};

function toIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function AuditWorkspace() {
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [items, setItems] = useState<AuditChangeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query: AuditChangeListQuery = {
      page,
      pageSize,
      sku: filters.sku || undefined,
      field: filters.field || undefined,
      source: filters.source || undefined,
      actorId: filters.actorId || undefined,
      from: toIso(filters.from),
      to: toIso(filters.to),
    };
    try {
      const result = await listAuditChanges(query);
      setItems(result.items);
      setTotal(result.total);
    } catch (requestError) {
      setItems([]);
      setTotal(0);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar la auditoría.',
      );
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => void load(), [load]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.from && draft.to && Date.parse(draft.from) > Date.parse(draft.to)) {
      setError('La fecha hasta debe ser posterior o igual a la fecha desde.');
      return;
    }
    setPage(1);
    setFilters(draft);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        eyebrow="Trazabilidad"
        title="Reportes y auditoría"
        description="Consulta el historial inmutable de cambios a nivel de campo, actor y origen."
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw aria-hidden="true" className={loading ? 'size-4 animate-spin' : 'size-4'} />
            Actualizar
          </Button>
        }
      />
      <ScreenGuide
        objective="Permite reconstruir quién cambió cada valor, cuándo ocurrió y cuál era el dato anterior."
        actions={[
          'Filtra por fechas, SKU, campo, origen o identificador del actor.',
          'Compara el valor anterior y nuevo de cada cambio.',
          'Navega por el historial paginado sin cargar todos los registros a la vez.',
        ]}
        dataSource="Cada fila proviene del modelo durable de auditoría del backend y conserva su correlación operativa."
        limitation="Los filtros se aplican sobre eventos ya persistidos; esta vista no permite editar ni eliminar auditoría."
      />

      <Card className="mb-5 p-5">
        <form onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              SKU
              <Input
                value={draft.sku}
                onChange={(e) => setDraft((value) => ({ ...value, sku: e.target.value }))}
                placeholder="6202-2RSR"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Campo
              <Input
                value={draft.field}
                onChange={(e) => setDraft((value) => ({ ...value, field: e.target.value }))}
                placeholder="diametro_interior"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Origen
              <Input
                value={draft.source}
                onChange={(e) => setDraft((value) => ({ ...value, source: e.target.value }))}
                placeholder="api, import…"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Actor
              <Input
                value={draft.actorId}
                onChange={(e) => setDraft((value) => ({ ...value, actorId: e.target.value }))}
                placeholder="ID o correo del actor"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Desde
              <Input
                type="datetime-local"
                value={draft.from}
                onChange={(e) => setDraft((value) => ({ ...value, from: e.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Hasta
              <Input
                type="datetime-local"
                value={draft.to}
                onChange={(e) => setDraft((value) => ({ ...value, to: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(emptyFilters);
                setFilters(emptyFilters);
                setPage(1);
              }}
            >
              Limpiar
            </Button>
            <Button type="submit">
              <Search aria-hidden="true" className="size-4" />
              Aplicar filtros
            </Button>
          </div>
        </form>
      </Card>

      {error ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : items.length === 0 ? (
        <StatePanel
          variant="empty"
          title="Sin cambios registrados"
          description="No se encontraron eventos para los filtros seleccionados."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
              <div>
                <h2 className="font-semibold">Historial de cambios</h2>
                <p className="text-xs text-muted-foreground">{total} registros encontrados</p>
              </div>
            </div>
            <Select
              label="Filas por página"
              className="w-28"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">SKU / recurso</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Campo</th>
                  <th className="px-4 py-3">Antes</th>
                  <th className="px-4 py-3">Después</th>
                  <th className="px-4 py-3">Vigente desde</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-orange-50/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Intl.DateTimeFormat('es-PE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(item.occurredAt))}
                    </td>
                    <td className="px-4 py-3">
                      <strong>{item.sku ?? item.resourceId}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {item.resourceType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          item.action === 'deleted'
                            ? 'danger'
                            : item.action === 'created'
                              ? 'success'
                              : 'info'
                        }
                      >
                        {actionLabels[item.action]}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{item.field}</td>
                    <td className="max-w-52 break-words px-4 py-3 text-xs">
                      {formatValue(item.before)}
                    </td>
                    <td className="max-w-52 break-words px-4 py-3 text-xs">
                      {formatValue(item.after)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {item.previousValueValidFrom
                        ? new Intl.DateTimeFormat('es-PE', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(item.previousValueValidFrom))
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">{item.actorId ?? 'Sistema'}</td>
                    <td className="px-4 py-3">
                      <span className="block">{item.source}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.correlationId}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Siguiente
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
