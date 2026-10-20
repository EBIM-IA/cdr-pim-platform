'use client';

import type { AuditChangeDto, WorkspaceDto } from '@cdr/contracts';
import { ArrowRight, Clock3, Copy, FileText, Package, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceData } from '@/components/use-workspace-data';
import { listAuditChanges } from '@/lib/operational-api';
import { cn, formatNumber } from '@/lib/utils';

interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  state: string;
  tone: 'amber' | 'blue' | 'green' | 'red';
  href: string;
  action: string;
}

const familyDefinitions = [
  { name: 'Rodamientos', patterns: ['rodamiento', 'cojinete'] },
  { name: 'Retenes y sellos', patterns: ['reten', 'sello'] },
  { name: 'Frenos', patterns: ['freno', 'pastilla', 'disco'] },
  { name: 'Transmisión', patterns: ['transmision', 'cardan', 'cruceta'] },
  { name: 'Lubricantes y fluidos', patterns: ['aceite', 'grasa', 'lubric', 'fluido'] },
  { name: 'Fijación', patterns: ['perno', 'tuerca', 'arandela', 'fijacion'] },
] as const;

const activityTones = {
  amber: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
  blue: { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600' },
  green: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  red: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-600' },
};

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();
}

function metric(workspace: WorkspaceDto | null, key: string): number {
  const value = workspace?.metrics.find((item) => item.key === key)?.value;
  return typeof value === 'number' ? value : 0;
}

function familyForCategory(category: string): string {
  const haystack = normalized(category);
  return (
    familyDefinitions.find((family) =>
      family.patterns.some((pattern) => haystack.includes(pattern)),
    )?.name ?? 'Otros'
  );
}

function auditActivity(change: AuditChangeDto): ActivityItem {
  const canOpenProduct = change.resourceType === 'product' || Boolean(change.sku);
  return {
    id: change.id,
    title: `${change.field} · ${change.sku ?? change.resourceType}`,
    detail: `${change.source} · ${new Intl.DateTimeFormat('es-EC', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(change.occurredAt))}`,
    state: 'Cambio',
    tone: 'blue',
    href: canOpenProduct
      ? `/products/${encodeURIComponent(change.resourceId)}`
      : '/administration?view=audit',
    action: canOpenProduct ? 'Ver SKU' : 'Ver auditoría',
  };
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando resumen del catálogo">
      <span className="sr-only" role="status">
        Cargando indicadores…
      </span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-[125px] rounded-xl" />
        ))}
      </div>
      <div className="mt-[18px] grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

function ActivityList({ items }: { items: readonly ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-5 rounded-lg bg-slate-50 p-4 text-xs text-muted-foreground">
        No hay eventos persistidos para mostrar en este momento.
      </p>
    );
  }

  return (
    <div className="mt-[18px] divide-y divide-slate-100">
      {items.map((item) => {
        const tone = activityTones[item.tone];
        return (
          <div key={item.id} className="flex min-h-14 items-center gap-2.5 py-2.5">
            <span className={cn('size-2.5 shrink-0 rounded-full', tone.dot)} />
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs">{item.title}</strong>
              <small className="block truncate text-[10px] text-slate-400">{item.detail}</small>
            </div>
            <span
              className={cn(
                'hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex',
                tone.badge,
              )}
            >
              {item.state}
            </span>
            <Button asChild variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-[11px]">
              <Link href={item.href}>{item.action}</Link>
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardOverview() {
  const reports = useWorkspaceData('reports');
  const imports = useWorkspaceData('imports');
  const integrations = useWorkspaceData('integrations');
  const [auditChanges, setAuditChanges] = useState<AuditChangeDto[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void listAuditChanges({ page: 1, pageSize: 3 }, controller.signal)
      .then((result) => setAuditChanges(result.items))
      .catch(() => setAuditChanges([]));
    return () => controller.abort();
  }, []);

  const total = metric(reports.workspace, 'products');
  const loading = reports.loading;
  const error = reports.error;
  const reload = reports.reload;
  const pending = metric(reports.workspace, 'in-review');
  const publishable = metric(reports.workspace, 'publishable');
  const affected = metric(reports.workspace, 'affected-products');
  const completeness = metric(reports.workspace, 'completion');
  const groups = metric(reports.workspace, 'groups');
  const templateCount = metric(reports.workspace, 'active-templates');
  const blockedIntegrations = metric(reports.workspace, 'blocked-external-systems');

  const families = useMemo(() => {
    const counts = new Map<string, number>(familyDefinitions.map((family) => [family.name, 0]));
    const categoryRows =
      reports.workspace?.rows.filter((row) => row.values.section === 'Categoría') ?? [];
    for (const row of categoryRows) {
      const family = familyForCategory(String(row.values.indicator ?? ''));
      const productCount = Number(row.values.value ?? 0);
      if (family !== 'Otros' && Number.isFinite(productCount)) {
        counts.set(family, (counts.get(family) ?? 0) + productCount);
      }
    }
    return familyDefinitions.map((family) => ({
      name: family.name,
      count: counts.get(family.name) ?? 0,
    }));
  }, [reports.workspace]);
  const maximumFamily = Math.max(...families.map((family) => family.count), 1);

  const activities = useMemo(() => {
    const items: ActivityItem[] = auditChanges.map(auditActivity);
    const batch = imports.workspace?.rows[0];
    if (batch) {
      const invalid = Number(batch.values.invalidRows ?? 0);
      items.push({
        id: `import:${batch.id}`,
        title: `Importación ${String(batch.values.target ?? '')}`,
        detail: `${String(batch.values.validRows ?? 0)} de ${String(batch.values.totalRows ?? 0)} registros válidos`,
        state: invalid > 0 ? 'Advertencia' : String(batch.values.status ?? 'Procesado'),
        tone: invalid > 0 ? 'amber' : 'green',
        href: '/imports',
        action: 'Ver lote',
      });
    }
    const blocked =
      integrations.workspace?.rows.filter((row) => row.values.configured === false) ?? [];
    for (const integration of blocked) {
      items.push({
        id: `integration:${integration.id}`,
        title: String(integration.values.system ?? 'Integración externa'),
        detail: String(integration.values.state ?? 'Contrato pendiente'),
        state: 'Pendiente',
        tone: 'red',
        href: '/integrations',
        action: 'Ver monitor',
      });
    }
    return items.slice(0, 4);
  }, [auditChanges, imports.workspace, integrations.workspace]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Vista general del estado del catálogo y actividad reciente."
        actions={
          <Button asChild>
            <Link href="/products">
              Ir al catálogo
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        }
      />

      <ScreenGuide
        objective="Punto de entrada diario. Resume cómo está el catálogo —completitud, pendientes, publicables y calidad— junto con la actividad reciente de integraciones y revisión."
        actionsLabel="Qué puedes probar"
        actions={[
          'Haz clic en cualquier indicador para ir al módulo que lo explica.',
          'La franja «Muestra navegable» cuenta los SKU reales disponibles en este entorno.',
        ]}
        dataSource="Todos los valores se calculan con datos persistidos y proyecciones autenticadas de la API. Cuando el backend aún no mide un indicador se presenta como no disponible."
      />

      {loading ? <DashboardSkeleton /> : null}
      {!loading && error ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar los indicadores"
          description={error}
          actionLabel="Reintentar"
          onAction={reload}
        />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-[18px]">
          <section
            aria-label="Indicadores principales"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
          >
            <MetricCard
              label="Productos"
              value={formatNumber(total)}
              note="SKU persistidos en PIM"
              icon={Package}
              href="/products"
            />
            <MetricCard
              label="Completitud"
              value={`${completeness}%`}
              note="promedio de obligatorios activos"
              icon={ShieldCheck}
              tone="green"
              href="/quality?view=quality"
            />
            <MetricCard
              label="Pendientes"
              value={formatNumber(pending)}
              note="en revisión en la muestra"
              icon={Clock3}
              tone="red"
              href="/quality?view=review"
            />
            <MetricCard
              label="Publicables"
              value={formatNumber(publishable)}
              note="cumplen obligatorios activos"
              icon={FileText}
              tone="blue"
              href="/publication"
            />
            <MetricCard
              label="Duplicados"
              value="—"
              note="motor de candidatos pendiente"
              icon={Copy}
              href="/quality?view=duplicates"
            />
          </section>

          <Card className="flex min-h-[43px] flex-wrap items-center gap-x-6 gap-y-2 px-[18px] py-2.5 text-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-primary">
              Muestra navegable
            </span>
            <Link
              href="/products"
              className="font-semibold underline decoration-dashed underline-offset-4 hover:text-primary"
            >
              {formatNumber(total)} SKU
            </Link>
            <Link
              href="/templates"
              className="font-semibold underline decoration-dashed underline-offset-4 hover:text-primary"
            >
              {formatNumber(templateCount)} plantillas activas
            </Link>
            <Link
              href="/quality?view=quality"
              className="font-semibold underline decoration-dashed underline-offset-4 hover:text-primary"
            >
              {formatNumber(affected)} con obligatorios faltantes
            </Link>
            <Link
              href="/publication"
              className="font-semibold underline decoration-dashed underline-offset-4 hover:text-primary"
            >
              {formatNumber(publishable)} publicables
            </Link>
            <Link
              href="/equivalences"
              className="font-semibold underline decoration-dashed underline-offset-4 hover:text-primary"
            >
              {formatNumber(groups)} grupos de equivalencias
            </Link>
            <Link
              href="/integrations"
              className="font-semibold underline decoration-dashed underline-offset-4 hover:text-primary"
            >
              {formatNumber(blockedIntegrations)} integraciones pendientes
            </Link>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="min-h-[290px] p-[22px]">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                Productos por familia · catálogo completo
              </h2>
              <div className="mt-[22px]">
                {families.map((family) => (
                  <Link
                    key={family.name}
                    href={`/products?q=${encodeURIComponent(family.name)}`}
                    className="flex items-center gap-3 py-[9px] text-xs hover:text-primary"
                  >
                    <span className="w-[110px] shrink-0 text-muted-foreground">{family.name}</span>
                    <span className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          family.count === maximumFamily ? 'bg-primary' : 'bg-slate-500',
                        )}
                        style={{
                          width: `${family.count ? Math.max(6, (family.count / maximumFamily) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <strong className="w-5 text-right tabular-nums">{family.count}</strong>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="min-h-[290px] p-[22px]">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Actividad reciente</h2>
              <ActivityList items={activities} />
            </Card>
          </div>

          <Card className="bg-[#f8f8f9] p-[22px]">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Calidad del catálogo</h2>
            <div className="mt-[18px] grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {(
                [
                  ['Sin imagen', '—', 'text-red-500', '/documents'],
                  ['Sin ficha técnica', '—', 'text-amber-500', '/documents'],
                  [
                    'Obligatorios faltantes',
                    formatNumber(affected),
                    'text-primary',
                    '/quality?view=quality',
                  ],
                  ['Con conflicto de fuente', '—', 'text-violet-500', '/quality?view=sources'],
                  [
                    'Listos para publicación',
                    formatNumber(publishable),
                    'text-emerald-600',
                    '/publication',
                  ],
                ] satisfies ReadonlyArray<readonly [string, string, string, string]>
              ).map(([label, value, color, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="rounded-xl bg-white p-5 text-center transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
                >
                  <small className="block text-[11px] text-muted-foreground">{label}</small>
                  <strong className={cn('mt-2 block text-2xl font-semibold', color)}>
                    {value}
                  </strong>
                </Link>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Los guiones identifican indicadores cuyo modelo persistente todavía no está
              disponible; no se reemplazan por cifras ilustrativas.
            </p>
          </Card>
        </div>
      ) : null}
    </>
  );
}
