'use client';

import type { WorkspaceDto, WorkspaceMetric, WorkspaceRow } from '@cdr/contracts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  FileArchive,
  FileSearch,
  Gauge,
  ImageIcon,
  KeyRound,
  Link2,
  ListChecks,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { AuditWorkspace } from '@/components/audit-workspace';
import {
  OperationsSecondaryWorkspace,
  type OperationsSecondaryView,
  type OperationsWorkspaceSlug,
} from '@/components/operations-secondary-workspace';
import {
  isQualitySecondaryView,
  QualitySecondaryWorkspace,
} from '@/components/quality-secondary-workspace';
import { ScreenGuide } from '@/components/screen-guide';
import { SmartSearchWorkspace } from '@/components/smart-search-workspace';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
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

interface WorkspaceView {
  id: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  mode: 'records' | 'connectors' | 'reports' | 'capabilities';
}

const workspaceViews: Partial<Record<ModuleSlug, readonly WorkspaceView[]>> = {
  documents: [
    {
      id: 'assets',
      label: 'Activos del SKU',
      title: 'Imágenes y documentos',
      description:
        'Activos digitales asociados al producto, con tipo, procedencia y estado técnico.',
      icon: ImageIcon,
      mode: 'records',
    },
    {
      id: 'bulk',
      label: 'Carga masiva ZIP',
      title: 'Carga masiva de documentos',
      description: 'Convención por SKU, validación previa y carga parcial de archivos aceptados.',
      icon: FileArchive,
      mode: 'capabilities',
    },
  ],
  quality: [
    {
      id: 'quality',
      label: 'Calidad',
      title: 'Calidad del catálogo',
      description:
        'Hallazgos deterministas calculados por el backend sobre el catálogo persistido.',
      icon: Gauge,
      mode: 'records',
    },
    {
      id: 'search',
      label: 'Búsqueda inteligente',
      title: 'Búsqueda inteligente',
      description:
        'Consulta de productos y homólogos elegibles sin alterar la identidad de los SKU.',
      icon: Search,
      mode: 'capabilities',
    },
    {
      id: 'extraction',
      label: 'Extracción IA',
      title: 'Revisión de extracción IA',
      description:
        'Comparación entre el valor vigente y una sugerencia trazable que requiere decisión humana.',
      icon: Bot,
      mode: 'capabilities',
    },
    {
      id: 'commercial',
      label: 'Descripción comercial',
      title: 'Descripción comercial con IA',
      description: 'Comparación entre la ficha técnica aprobada y la propuesta comercial.',
      icon: Bot,
      mode: 'capabilities',
    },
    {
      id: 'duplicates',
      label: 'Duplicados',
      title: 'Posibles duplicados',
      description:
        'Candidatos para comparación; el sistema nunca fusiona productos automáticamente.',
      icon: Boxes,
      mode: 'capabilities',
    },
    {
      id: 'review',
      label: 'Bandeja',
      title: 'Bandeja de revisión y aprobación',
      description: 'Solicitudes pendientes, aprobadas y devueltas para ajuste con trazabilidad.',
      icon: ListChecks,
      mode: 'capabilities',
    },
    {
      id: 'sources',
      label: 'Fuentes',
      title: 'Prioridad de fuentes',
      description: 'Explica el valor vigente, su fuente y las decisiones de override humano.',
      icon: FileSearch,
      mode: 'capabilities',
    },
    {
      id: 'conflict',
      label: 'Resolver conflicto',
      title: 'Resolver conflicto de fuentes',
      description: 'Candidatos de fuente, propuesta y override humano documentado.',
      icon: AlertTriangle,
      mode: 'capabilities',
    },
  ],
  publication: [
    {
      id: 'channels',
      label: 'Por canal',
      title: 'Publicación por canal',
      description: 'Estado PIM y condiciones conocidas antes de exponer un SKU a un canal.',
      icon: Gauge,
      mode: 'records',
    },
    {
      id: 'prestashop',
      label: 'PrestaShop',
      title: 'Canal PrestaShop',
      description:
        'Contrato de consumo, campos expuestos y dependencias de ICOM todavía pendientes.',
      icon: ServerCog,
      mode: 'capabilities',
    },
    {
      id: 'images',
      label: 'Migración de imágenes',
      title: 'Migración de imágenes PrestaShop',
      description:
        'Seguimiento de activos por SKU sin convertir precio o stock en datos maestros PIM.',
      icon: ImageIcon,
      mode: 'capabilities',
    },
  ],
  integrations: [
    {
      id: 'monitor',
      label: 'Monitor',
      title: 'Monitor de integraciones',
      description: 'Estado real de componentes internos y contratos externos del ecosistema PIM.',
      icon: Activity,
      mode: 'connectors',
    },
    {
      id: 'sources',
      label: 'Fuentes externas',
      title: 'Fuentes externas',
      description:
        'Capacidades de enriquecimiento desacopladas, sujetas a licencia y credenciales.',
      icon: Link2,
      mode: 'capabilities',
    },
    {
      id: 'batches',
      label: 'Lotes AX',
      title: 'Detalle de lote Sismetic / AX',
      description: 'PUSH hacia PIM, validación por registro e idempotencia del procesamiento.',
      icon: FileArchive,
      mode: 'capabilities',
    },
  ],
  reports: [
    {
      id: 'reports',
      label: 'Reportes',
      title: 'Reportes',
      description: 'Accesos directos a indicadores vivos calculados por cada módulo.',
      icon: BarChart3,
      mode: 'reports',
    },
    {
      id: 'data',
      label: 'Datos agregados',
      title: 'Agregados del catálogo',
      description: 'Conteos persistidos por estado y marca, calculados en PostgreSQL.',
      icon: Database,
      mode: 'records',
    },
    {
      id: 'searches',
      label: 'Búsquedas',
      title: 'Reporte de búsquedas',
      description: 'Consultas frecuentes, fallidas y sin coincidencia cuando exista telemetría.',
      icon: Search,
      mode: 'capabilities',
    },
  ],
  administration: [
    {
      id: 'users',
      label: 'Usuarios',
      title: 'Usuarios',
      description:
        'Identidad efectiva de la sesión y dependencia del proveedor empresarial definitivo.',
      icon: Users,
      mode: 'capabilities',
    },
    {
      id: 'roles',
      label: 'Roles y permisos',
      title: 'Roles y permisos',
      description: 'Matriz de capacidades aplicada por el backend a la sesión autenticada.',
      icon: KeyRound,
      mode: 'records',
    },
    {
      id: 'audit',
      label: 'Auditoría',
      title: 'Auditoría y trazabilidad',
      description: 'Cambios persistidos con actor, origen, valores y motivo.',
      icon: ShieldCheck,
      mode: 'capabilities',
    },
    {
      id: 'settings',
      label: 'Catálogos',
      title: 'Catálogos de configuración',
      description:
        'Unidades, marcas, identificadores y vocabularios gobernados por Administración.',
      icon: ServerCog,
      mode: 'capabilities',
    },
  ],
};

const reportCards = [
  [
    'Calidad del catálogo',
    'Obligatorios faltantes y hallazgos deterministas.',
    '/quality?view=quality',
    Gauge,
  ],
  ['Equivalencias', 'Grupos por código unificador y homólogos aprobados.', '/equivalences', Link2],
  ['Publicación', 'Estados PIM y preparación para canales.', '/publication', CheckCircle2],
  ['Integraciones', 'Componentes, conectores y dependencias.', '/integrations', Activity],
  [
    'Trazabilidad',
    'Cambios auditados por actor y entidad.',
    '/administration?view=audit',
    ShieldCheck,
  ],
  ['Catálogo', 'Productos y filtros sobre datos persistidos.', '/products', Boxes],
] as const;

function metricValue(metric: WorkspaceMetric): string {
  return formatWorkspaceMetric(metric);
}

function Metrics({ workspace }: { workspace: WorkspaceDto }) {
  const icons = [Activity, Database, CheckCircle2, Clock3] as const;
  return (
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
      {workspace.metrics.slice(0, 4).map((metric, index) => {
        const Icon = icons[index % icons.length] ?? Activity;
        return (
          <Card key={metric.key} className="flex min-h-28 items-start gap-3 p-4 sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-100 text-primary">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <small className="text-muted-foreground">{metric.label}</small>
              <strong className="mt-1 block break-words text-2xl tracking-tight text-cdr-ink">
                {metricValue(metric)}
              </strong>
            </span>
          </Card>
        );
      })}
    </section>
  );
}

function RecordTable({ workspace }: { workspace: WorkspaceDto }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => filterWorkspaceRows(workspace.rows, workspace.columns, query),
    [query, workspace.columns, workspace.rows],
  );

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-slate-50/70 p-4">
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar en los registros</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en los datos del módulo…"
            className="bg-white pl-9"
          />
        </label>
      </div>
      {workspace.columns.length > 0 && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {workspace.columns.map((column) => (
                  <th key={column.key} scope="col" className="px-4 py-3">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-orange-50/40">
                  {workspace.columns.map((column) => {
                    const formatted = formatWorkspaceCell(row.values[column.key], column);
                    return (
                      <td key={column.key} className="max-w-80 px-4 py-3 align-top">
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
        <div className="p-5">
          <StatePanel
            variant="empty"
            title={query ? 'Sin coincidencias' : 'Sin registros disponibles'}
            description={
              query
                ? 'Ajusta la búsqueda para consultar las filas entregadas por el backend.'
                : 'El backend no publicó registros para esta vista. No se muestran datos de demostración como si fueran reales.'
            }
            {...(query ? { actionLabel: 'Limpiar búsqueda', onAction: () => setQuery('') } : {})}
          />
        </div>
      )}
      <div className="border-t px-4 py-3 text-xs text-muted-foreground">
        {rows.length} de {workspace.totalRows} registros · actualizado{' '}
        {formatWorkspaceDateTime(workspace.generatedAt)}
      </div>
    </Card>
  );
}

function ConnectorCards({ rows }: { rows: readonly WorkspaceRow[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const values = Object.values(row.values);
        const name = String(values[0] ?? row.id);
        const state = String(values.at(-1) ?? 'Sin estado');
        const configured = values.some((value) => value === true);
        return (
          <Card key={row.id} className="flex min-h-44 flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-orange-100 text-primary">
                <ServerCog className="size-5" aria-hidden="true" />
              </span>
              <StatusBadge tone={configured ? 'success' : 'warning'}>
                {configured ? 'Configurado' : 'Pendiente'}
              </StatusBadge>
            </div>
            <h3 className="mt-4 font-semibold text-cdr-ink">{name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{state}</p>
          </Card>
        );
      })}
    </div>
  );
}

function ReportCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {reportCards.map(([title, description, href, Icon]) => (
        <Link key={title} href={href} className="group focus-visible:outline-none">
          <Card className="flex min-h-48 h-full flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:border-orange-200 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-cdr-ink">
            <span className="grid size-10 place-items-center rounded-full bg-orange-100 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold text-cdr-ink">{title}</h3>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              Abrir <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function CapabilityPanel({ workspace, view }: { workspace: WorkspaceDto; view: WorkspaceView }) {
  const blocked = workspace.actions.filter((action) => action.availability === 'blocked');
  const Icon = view.icon;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-100 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold text-cdr-ink">Alcance funcional</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{view.description}</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <strong className="block">Conectado al estado real del backend</strong>
          <span className="mt-1 block leading-relaxed opacity-80">
            Esta vista no simula confirmaciones. Las operaciones se habilitan únicamente cuando la
            API declara un endpoint soportado y el usuario posee la capacidad requerida.
          </span>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold text-cdr-ink">Dependencias y acciones</h3>
        <ul className="mt-4 space-y-3">
          {blocked.length > 0 ? (
            blocked.map((action) => (
              <li key={action.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                  <AlertTriangle className="size-4" aria-hidden="true" /> {action.label}
                </span>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/75">{action.reason}</p>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">
              No hay dependencias bloqueantes declaradas.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function selectedFromLocation(views: readonly WorkspaceView[]): string {
  if (typeof window === 'undefined') return views[0]?.id ?? '';
  const requested = new URLSearchParams(window.location.search).get('view');
  return views.some((view) => view.id === requested) ? (requested ?? '') : (views[0]?.id ?? '');
}

export function ReferenceWorkspace({ definition }: { definition: ModuleDefinition }) {
  const views = workspaceViews[definition.slug] ?? [];
  const [selected, setSelected] = useState(views[0]?.id ?? '');
  const { workspace, loading, error, reload } = useWorkspaceData(definition.slug);

  useEffect(() => setSelected(selectedFromLocation(views)), [views]);

  const active = views.find((view) => view.id === selected) ?? views[0];
  if (!active) return null;

  const operationsSlug = (
    ['publication', 'integrations', 'reports', 'administration'] as const
  ).find((slug) => slug === definition.slug);
  const useOperationsSecondary =
    operationsSlug && !(definition.slug === 'reports' && active.id === 'reports');
  const changeView = (id: string) => {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set('view', id);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  return (
    <>
      <PageHeader
        eyebrow={definition.eyebrow}
        title={active.title}
        description={active.description}
        actions={
          <Button variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
            Actualizar
          </Button>
        }
      />
      <ScreenGuide
        objective={definition.objective}
        actions={definition.actions}
        dataSource={definition.dataSource}
        limitation={definition.limitation}
      />

      <nav
        className="mb-5 flex gap-2 overflow-x-auto pb-1"
        aria-label={`Vistas de ${definition.label}`}
      >
        {views.map((view) => {
          const Icon = view.icon;
          const current = view.id === active.id;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => changeView(view.id)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition',
                current
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50',
              )}
            >
              <Icon className="size-4" aria-hidden="true" /> {view.label}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="space-y-4" aria-label="Cargando módulo" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : null}
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
        definition.slug === 'quality' && isQualitySecondaryView(active.id) ? (
          <QualitySecondaryWorkspace view={active.id} workspace={workspace} />
        ) : useOperationsSecondary ? (
          <div className="space-y-5">
            <OperationsSecondaryWorkspace
              workspace={workspace}
              slug={operationsSlug as OperationsWorkspaceSlug}
              view={active.id as OperationsSecondaryView}
              onRefresh={reload}
              refreshing={loading}
            />
            {definition.slug === 'administration' && active.id === 'audit' ? (
              <AuditWorkspace embedded />
            ) : null}
          </div>
        ) : (
          <div>
            <Metrics workspace={workspace} />
            {workspace.notices.length > 0 ? (
              <div className="mb-5 grid gap-3 lg:grid-cols-2">
                {workspace.notices.map((notice) => (
                  <div
                    key={notice.id}
                    className={cn(
                      'rounded-xl border p-4 text-sm',
                      notice.severity === 'error'
                        ? 'border-red-200 bg-red-50 text-red-950'
                        : notice.severity === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-950'
                          : 'border-blue-200 bg-blue-50 text-blue-950',
                    )}
                  >
                    <strong>{notice.title}</strong>
                    <p className="mt-1 leading-relaxed opacity-75">{notice.message}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {definition.slug === 'quality' && active.id === 'search' ? (
              <SmartSearchWorkspace />
            ) : active.mode === 'records' ? (
              <RecordTable workspace={workspace} />
            ) : null}
            {active.mode === 'connectors' ? <ConnectorCards rows={workspace.rows} /> : null}
            {active.mode === 'reports' ? <ReportCards /> : null}
            {definition.slug === 'administration' && active.id === 'audit' ? (
              <AuditWorkspace embedded />
            ) : definition.slug === 'quality' && active.id === 'search' ? null : active.mode ===
              'capabilities' ? (
              <CapabilityPanel workspace={workspace} view={active} />
            ) : null}
          </div>
        )
      ) : null}
    </>
  );
}
