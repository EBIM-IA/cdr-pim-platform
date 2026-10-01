'use client';

import type {
  WorkspaceAction,
  WorkspaceDto,
  WorkspaceNotice,
  WorkspaceOperationalStatus,
} from '@cdr/contracts';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  Info,
  ListChecks,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone, type BadgeTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceData } from '@/components/use-workspace-data';
import type { ModuleDefinition, ModuleSlug } from '@/lib/module-definitions';
import {
  filterWorkspaceRows,
  formatWorkspaceCell,
  formatWorkspaceDateTime,
  formatWorkspaceMetric,
  isCompactWorkspaceStatus,
} from '@/lib/workspace-view';
import { cn } from '@/lib/utils';

const catalogRelevantModules: readonly ModuleSlug[] = [
  'templates',
  'documents',
  'imports',
  'quality',
  'publication',
];

const operationalStatus: Record<
  WorkspaceOperationalStatus,
  {
    label: string;
    title: string;
    description: string;
    tone: BadgeTone;
    icon: LucideIcon;
    iconClassName: string;
  }
> = {
  operational: {
    label: 'Operativo',
    title: 'Consulta operativa conectada',
    description:
      'El backend entregó esta proyección correctamente. Solo las acciones declaradas como disponibles están soportadas.',
    tone: 'success',
    icon: CheckCircle2,
    iconClassName: 'bg-emerald-100 text-emerald-700',
  },
  partial: {
    label: 'Parcial',
    title: 'Operación parcial',
    description:
      'La consulta usa datos del backend, pero todavía existen capacidades bloqueadas o dependencias pendientes.',
    tone: 'warning',
    icon: ShieldAlert,
    iconClassName: 'bg-amber-100 text-amber-700',
  },
  blocked: {
    label: 'Bloqueado',
    title: 'Capacidad operativa bloqueada',
    description:
      'El backend declara que las dependencias necesarias aún no están disponibles. No se ofrecen mutaciones desde esta pantalla.',
    tone: 'danger',
    icon: Ban,
    iconClassName: 'bg-red-100 text-red-700',
  },
};

const metricIcons: readonly LucideIcon[] = [Activity, Database, ListChecks, BarChart3];
const metricIconStyles = [
  'bg-orange-100 text-primary',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
] as const;

const noticeStyles: Record<WorkspaceNotice['severity'], { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'border-blue-200 bg-blue-50 text-blue-900' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-950' },
  error: { icon: XCircle, className: 'border-red-200 bg-red-50 text-red-900' },
};

function WorkspaceLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando módulo operativo" className="space-y-5">
      <span className="sr-only" role="status">
        Cargando información del módulo…
      </span>
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

function WorkspaceStatus({ workspace }: { workspace: WorkspaceDto }) {
  const status = operationalStatus[workspace.operationalStatus];
  const Icon = status.icon;

  return (
    <section
      aria-labelledby="workspace-status-title"
      className="mb-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:p-5"
      role="status"
    >
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full shadow-sm',
          status.iconClassName,
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="workspace-status-title" className="font-semibold text-cdr-ink">
            {status.title}
          </h2>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {status.description}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-3.5" />
          Actualizado por el backend:{' '}
          <time dateTime={workspace.generatedAt}>
            {formatWorkspaceDateTime(workspace.generatedAt)}
          </time>
        </p>
      </div>
    </section>
  );
}

function WorkspaceMetrics({ workspace }: { workspace: WorkspaceDto }) {
  if (workspace.metrics.length === 0) return null;

  return (
    <section aria-labelledby="workspace-metrics-title" className="mb-5">
      <h2 id="workspace-metrics-title" className="sr-only">
        Indicadores del módulo
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {workspace.metrics.map((metric, index) => {
          const Icon = metricIcons[index % metricIcons.length] ?? Activity;
          const iconStyle = metricIconStyles[index % metricIconStyles.length];
          return (
            <Card key={metric.key} className="flex min-h-28 items-start gap-3 p-4 sm:p-5">
              <span
                className={cn('grid size-10 shrink-0 place-items-center rounded-full', iconStyle)}
              >
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <strong className="mt-1 block break-words text-2xl font-semibold tracking-tight text-cdr-ink sm:text-3xl">
                  {formatWorkspaceMetric(metric)}
                </strong>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function WorkspaceNotices({ notices }: { notices: readonly WorkspaceNotice[] }) {
  if (notices.length === 0) return null;

  return (
    <section aria-labelledby="workspace-notices-title" className="mb-5">
      <h2 id="workspace-notices-title" className="mb-3 text-lg font-semibold text-cdr-ink">
        Avisos operativos
      </h2>
      <ul className="grid gap-3 lg:grid-cols-2">
        {notices.map((notice) => {
          const style = noticeStyles[notice.severity];
          const Icon = style.icon;
          return (
            <li
              key={notice.id}
              className={cn('flex items-start gap-3 rounded-xl border p-4', style.className)}
            >
              <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-semibold">{notice.title}</h3>
                <p className="mt-1 text-sm leading-relaxed opacity-80">{notice.message}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WorkspaceTable({ workspace }: { workspace: WorkspaceDto }) {
  const [query, setQuery] = useState('');
  const filteredRows = useMemo(
    () => filterWorkspaceRows(workspace.rows, workspace.columns, query),
    [query, workspace.columns, workspace.rows],
  );

  if (workspace.columns.length === 0 || workspace.rows.length === 0) {
    return (
      <section aria-labelledby="workspace-records-title" className="mb-5">
        <h2 id="workspace-records-title" className="mb-3 text-lg font-semibold text-cdr-ink">
          Información operativa
        </h2>
        <StatePanel
          variant="empty"
          title="No hay registros disponibles"
          description="El backend respondió correctamente, pero todavía no publicó filas para este módulo. Los indicadores y acciones declaradas siguen reflejando su estado real."
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="workspace-records-title" className="mb-5">
      <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 id="workspace-records-title" className="text-lg font-semibold text-cdr-ink">
            Información operativa
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.trim()
              ? `${filteredRows.length} coincidencias en ${workspace.rows.length} filas cargadas`
              : `${workspace.rows.length} filas cargadas de ${workspace.totalRows} registradas`}
          </p>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <div className="border-b bg-slate-50/70 p-4">
          <label className="grid max-w-xl gap-1.5 text-xs font-semibold text-muted-foreground">
            <span>Buscar en las filas cargadas</span>
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cualquier valor…"
                className="bg-white pl-10"
              />
            </span>
          </label>
        </div>

        {filteredRows.length > 0 ? (
          <div className="scrollbar-thin max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Datos operativos de {workspace.slug}, actualizados{' '}
                {formatWorkspaceDateTime(workspace.generatedAt)}
              </caption>
              <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  {workspace.columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 font-semibold"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-orange-50/45">
                    {workspace.columns.map((column) => {
                      const value = row.values[column.key];
                      const formatted = formatWorkspaceCell(value, column);
                      return (
                        <td key={column.key} className="max-w-[22rem] px-4 py-3 align-top">
                          {column.type === 'status' && isCompactWorkspaceStatus(formatted) ? (
                            <StatusBadge tone={statusTone(formatted)}>
                              {statusLabel(formatted)}
                            </StatusBadge>
                          ) : (
                            <span className="break-words text-slate-700">{formatted}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center" role="status">
            <Search aria-hidden="true" className="mx-auto size-8 text-slate-300" />
            <h3 className="mt-3 font-semibold">No encontramos coincidencias</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Prueba con otro término; la búsqueda se aplica a las filas cargadas.
            </p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => setQuery('')}>
              Limpiar búsqueda
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}

interface WorkspaceActionsProps {
  actions: readonly WorkspaceAction[];
  loading: boolean;
  onReload: () => void;
  onBrowseProducts: () => void;
  onRevalidateSession: () => void;
}

function actionControl(
  action: Extract<WorkspaceAction, { availability: 'supported' }>,
  callbacks: Pick<WorkspaceActionsProps, 'onReload' | 'onBrowseProducts' | 'onRevalidateSession'>,
  loading: boolean,
) {
  switch (action.id) {
    case 'refresh':
      return {
        label: loading ? 'Actualizando…' : 'Actualizar datos',
        onClick: callbacks.onReload,
        disabled: loading,
        icon: RefreshCw,
      };
    case 'browse-products':
      return {
        label: 'Abrir productos',
        onClick: callbacks.onBrowseProducts,
        disabled: false,
        icon: ArrowRight,
      };
    case 'current-session':
      return {
        label: 'Revalidar sesión',
        onClick: callbacks.onRevalidateSession,
        disabled: false,
        icon: ShieldAlert,
      };
    default:
      return null;
  }
}

export function WorkspaceActions({
  actions,
  loading,
  onReload,
  onBrowseProducts,
  onRevalidateSession,
}: WorkspaceActionsProps) {
  return (
    <section aria-labelledby="workspace-actions-title">
      <div className="mb-3">
        <h2 id="workspace-actions-title" className="text-lg font-semibold text-cdr-ink">
          Capacidades declaradas por el backend
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta pantalla no ejecuta mutaciones que el backend no haya declarado como soportadas.
        </p>
      </div>

      {actions.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => {
            const control =
              action.availability === 'supported'
                ? actionControl(
                    action,
                    { onReload, onBrowseProducts, onRevalidateSession },
                    loading,
                  )
                : null;
            const ControlIcon = control?.icon;

            return (
              <li key={action.id}>
                <Card className="flex h-full flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-cdr-ink">{action.label}</h3>
                    <StatusBadge tone={action.availability === 'supported' ? 'success' : 'warning'}>
                      {action.availability === 'supported' ? 'Soportada' : 'Bloqueada'}
                    </StatusBadge>
                  </div>
                  {action.availability === 'supported' ? (
                    <>
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        <strong className="text-slate-700">{action.method}</strong>{' '}
                        <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                          {action.endpoint}
                        </code>
                      </p>
                      {control && ControlIcon ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4 w-full"
                          onClick={control.onClick}
                          disabled={control.disabled}
                        >
                          <ControlIcon
                            aria-hidden="true"
                            className={cn(
                              'size-4',
                              action.id === 'refresh' && loading && 'animate-spin',
                            )}
                          />
                          {control.label}
                        </Button>
                      ) : (
                        <p className="mt-4 text-xs leading-relaxed text-amber-800">
                          Disponible por API; esta versión web aún no tiene un control asociado.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {action.reason}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground">
          El backend no declaró acciones adicionales para este módulo.
        </Card>
      )}
    </section>
  );
}

export function ModuleWorkspace({ definition }: { definition: ModuleDefinition }) {
  const router = useRouter();
  const linksToCatalog = catalogRelevantModules.includes(definition.slug);
  const { workspace, loading, error, reload } = useWorkspaceData(definition.slug);
  const browseProducts = useCallback(() => router.push('/products'), [router]);
  const revalidateSession = useCallback(() => window.location.reload(), []);

  return (
    <>
      <PageHeader
        eyebrow={definition.eyebrow}
        title={definition.label}
        description={definition.description}
        actions={
          <>
            {linksToCatalog ? (
              <Button asChild variant="outline">
                <Link href="/products">
                  Consultar catálogo
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={reload} disabled={loading}>
              <RefreshCw aria-hidden="true" className={cn('size-4', loading && 'animate-spin')} />
              Actualizar
            </Button>
          </>
        }
      />

      <ScreenGuide
        objective={definition.objective}
        actions={definition.actions}
        actionsLabel="Qué puedes hacer hoy"
        dataSource={definition.dataSource}
        limitation={`Esta vista es de solo consulta. ${definition.limitation}`}
      />

      {loading ? <WorkspaceLoading /> : null}
      {!loading && error ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar este módulo"
          description={error}
          actionLabel="Reintentar"
          onAction={reload}
        />
      ) : null}
      {!loading && workspace ? (
        <>
          <WorkspaceStatus workspace={workspace} />
          <WorkspaceMetrics workspace={workspace} />
          <WorkspaceNotices notices={workspace.notices} />
          <WorkspaceTable workspace={workspace} />
          <WorkspaceActions
            actions={workspace.actions}
            loading={loading}
            onReload={reload}
            onBrowseProducts={browseProducts}
            onRevalidateSession={revalidateSession}
          />
        </>
      ) : null}
    </>
  );
}
