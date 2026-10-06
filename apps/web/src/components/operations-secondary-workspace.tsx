'use client';

import type {
  WorkspaceAction,
  WorkspaceColumn,
  WorkspaceDto,
  WorkspaceRow,
  WorkspaceSlug,
} from '@cdr/contracts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Database,
  FileArchive,
  ImageIcon,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  filterWorkspaceRows,
  formatWorkspaceCell,
  formatWorkspaceDateTime,
  formatWorkspaceMetric,
  isCompactWorkspaceStatus,
} from '@/lib/workspace-view';
import { cn } from '@/lib/utils';

export type OperationsWorkspaceSlug = Extract<
  WorkspaceSlug,
  'publication' | 'integrations' | 'reports' | 'administration'
>;

export type OperationsSecondaryView =
  | 'channels'
  | 'prestashop'
  | 'images'
  | 'sources'
  | 'monitor'
  | 'batches'
  | 'users'
  | 'roles'
  | 'audit'
  | 'reports'
  | 'data'
  | 'searches'
  | 'settings';

export interface OperationsSecondaryWorkspaceProps {
  workspace: WorkspaceDto;
  slug: OperationsWorkspaceSlug;
  view: OperationsSecondaryView;
  /** Reutiliza el `reload` del hook que obtuvo el WorkspaceDto. */
  onRefresh?: () => void | Promise<void>;
  /** Permite que el integrador ejecute solo acciones que la API marcó como soportadas. */
  onSupportedAction?: (
    action: Extract<WorkspaceAction, { availability: 'supported' }>,
  ) => void | Promise<void>;
  refreshing?: boolean;
}

interface ViewDefinition {
  slug: OperationsWorkspaceSlug;
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  presentation: 'publication' | 'table' | 'cards' | 'capabilities' | 'reports';
}

const viewDefinitions: Record<OperationsSecondaryView, ViewDefinition> = {
  channels: {
    slug: 'publication',
    title: 'Publicación por canal',
    description:
      'Candidatos persistidos y condiciones conocidas antes de exponer productos a un canal.',
    icon: CheckCircle2,
    emptyTitle: 'No hay candidatos de publicación',
    emptyDescription: 'El backend no devolvió productos en estado de revisión para este corte.',
    presentation: 'publication',
  },
  prestashop: {
    slug: 'publication',
    title: 'Canal PrestaShop',
    description:
      'Estado verificable del contrato de publicación; no se inventan rutas, payloads ni credenciales.',
    icon: ServerCog,
    emptyTitle: 'Contrato técnico pendiente',
    emptyDescription:
      'La proyección no publica operaciones de PrestaShop hasta que exista un adaptador real y una regla de elegibilidad aprobada.',
    presentation: 'capabilities',
  },
  images: {
    slug: 'publication',
    title: 'Migración de imágenes PrestaShop',
    description:
      'Consulta de disponibilidad del flujo de imágenes sin presentar lotes o activos simulados.',
    icon: ImageIcon,
    emptyTitle: 'Migración de imágenes no disponible',
    emptyDescription:
      'El workspace todavía no expone un contrato de lotes, consulta por SKU ni resultados de migración.',
    presentation: 'capabilities',
  },
  sources: {
    slug: 'integrations',
    title: 'Fuentes externas',
    description:
      'Componentes y conectores que el backend puede verificar sin revelar secretos ni simular conectividad.',
    icon: Database,
    emptyTitle: 'No hay fuentes declaradas',
    emptyDescription: 'La API no devolvió componentes o conectores para este entorno.',
    presentation: 'cards',
  },
  monitor: {
    slug: 'integrations',
    title: 'Monitor de integraciones',
    description: 'Estado real de configuración de los componentes internos y sistemas externos.',
    icon: Activity,
    emptyTitle: 'Sin integraciones para monitorear',
    emptyDescription: 'La API no publicó componentes en la proyección actual.',
    presentation: 'table',
  },
  batches: {
    slug: 'integrations',
    title: 'Lotes Sismetic / AX',
    description:
      'Superficie reservada para recepción, validación, errores y reproceso idempotente de lotes.',
    icon: FileArchive,
    emptyTitle: 'Lotes AX todavía no expuestos',
    emptyDescription:
      'La proyección actual valida la configuración, pero no publica lotes ni registros de procesamiento.',
    presentation: 'capabilities',
  },
  users: {
    slug: 'administration',
    title: 'Usuarios',
    description:
      'Identidad efectiva de la sesión; las altas y bajas dependen del proveedor empresarial definitivo.',
    icon: Users,
    emptyTitle: 'Directorio de usuarios no disponible',
    emptyDescription:
      'El backend publica la identidad autenticada, pero no un directorio administrable de usuarios.',
    presentation: 'capabilities',
  },
  roles: {
    slug: 'administration',
    title: 'Roles y permisos',
    description: 'Asignaciones efectivas aplicadas por el backend al actor autenticado.',
    icon: KeyRound,
    emptyTitle: 'Sin asignaciones efectivas',
    emptyDescription: 'No se recibieron roles ni capacidades para la sesión actual.',
    presentation: 'table',
  },
  audit: {
    slug: 'administration',
    title: 'Auditoría y trazabilidad',
    description:
      'Estado de las capacidades administrativas; el historial detallado debe consultarse en su endpoint durable.',
    icon: ShieldCheck,
    emptyTitle: 'Auditoría no incluida en este workspace',
    emptyDescription:
      'Esta proyección no transporta eventos de auditoría. La vista integrada debe usar el endpoint autenticado de trazabilidad.',
    presentation: 'capabilities',
  },
  reports: {
    slug: 'reports',
    title: 'Reportes',
    description: 'Agregados vivos calculados sobre el catálogo persistido.',
    icon: BarChart3,
    emptyTitle: 'No hay agregados disponibles',
    emptyDescription: 'El backend no publicó indicadores para este corte.',
    presentation: 'reports',
  },
  data: {
    slug: 'reports',
    title: 'Agregados del catálogo',
    description: 'Conteos persistidos por estado y marca, calculados por el backend.',
    icon: Database,
    emptyTitle: 'No hay agregados disponibles',
    emptyDescription: 'El backend no publicó filas agregadas para este corte.',
    presentation: 'table',
  },
  searches: {
    slug: 'reports',
    title: 'Reporte de búsquedas',
    description:
      'Superficie reservada para consultas frecuentes, búsquedas fallidas y términos sin resultados.',
    icon: Search,
    emptyTitle: 'Telemetría de búsqueda no disponible',
    emptyDescription:
      'El contrato de reportes actual no contiene eventos o agregados de búsqueda; no se muestran cifras ilustrativas.',
    presentation: 'capabilities',
  },
  settings: {
    slug: 'administration',
    title: 'Catálogos de configuración',
    description:
      'Superficie reservada para unidades, marcas, tipos de identificador y vocabularios gobernados.',
    icon: Boxes,
    emptyTitle: 'Catálogos no expuestos por la API',
    emptyDescription:
      'La proyección administrativa no contiene catálogos editables ni endpoints de mantenimiento.',
    presentation: 'capabilities',
  },
};

function Metrics({ workspace }: { workspace: WorkspaceDto }) {
  const icons = [Database, CheckCircle2, Activity, ShieldCheck] as const;

  if (workspace.metrics.length === 0) return null;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores reales">
      {workspace.metrics.slice(0, 4).map((metric, index) => {
        const Icon = icons[index % icons.length] ?? Database;
        return (
          <Card key={metric.key} className="flex min-h-28 items-start gap-3 p-4 sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-100 text-primary">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <small className="text-muted-foreground">{metric.label}</small>
              <strong className="mt-1 block break-words text-2xl tracking-tight text-cdr-ink">
                {formatWorkspaceMetric(metric)}
              </strong>
            </span>
          </Card>
        );
      })}
    </section>
  );
}

function Notices({ workspace }: { workspace: WorkspaceDto }) {
  if (workspace.notices.length === 0) return null;

  return (
    <section className="grid gap-3 lg:grid-cols-2" aria-label="Avisos del backend">
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
    </section>
  );
}

function EmptyCapability({ definition }: { definition: ViewDefinition }) {
  const Icon = definition.icon;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-white text-slate-500 shadow-sm">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 font-semibold text-cdr-ink">{definition.emptyTitle}</h3>
      <p className="mx-auto mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {definition.emptyDescription}
      </p>
    </div>
  );
}

function blockedActions(workspace: WorkspaceDto) {
  return workspace.actions.filter(
    (action): action is Extract<WorkspaceAction, { availability: 'blocked' }> =>
      action.availability === 'blocked',
  );
}

function BlockedBanner({ workspace, fallback }: { workspace: WorkspaceDto; fallback: string }) {
  const blocked = blockedActions(workspace);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100">
        <LockKeyhole className="size-4" aria-hidden="true" />
      </span>
      <div>
        <strong className="block text-sm">
          {blocked[0]?.label ?? 'Capacidad pendiente de contrato'}
        </strong>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/75">
          {blocked[0]?.reason ?? fallback}
        </p>
      </div>
    </div>
  );
}

function PublicationSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.8fr)]">
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Canales</h3>
        <div className="mt-3 space-y-3">
          {workspace.actions.map((action) => (
            <div
              key={action.id}
              className="flex items-start justify-between gap-3 border-b py-3 last:border-0"
            >
              <span className="min-w-0">
                <strong className="block text-sm text-cdr-ink">{action.label}</strong>
                <small className="mt-1 block break-words leading-relaxed text-muted-foreground">
                  {action.availability === 'blocked'
                    ? action.reason
                    : `${action.method} ${action.endpoint}`}
                </small>
              </span>
              <StatusBadge tone={action.availability === 'supported' ? 'success' : 'warning'}>
                {action.availability === 'supported' ? 'Disponible' : 'Pendiente'}
              </StatusBadge>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
          El estado PIM de una fila no prueba por sí solo su elegibilidad para un canal.
        </div>
      </Card>
      <div className="min-w-0">
        <RowTable workspace={workspace} definition={definition} />
      </div>
    </div>
  );
}

function ImageMigrationSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Consulta de imágenes por SKU</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            aria-label="SKU a consultar"
            placeholder="Código de artículo"
            disabled
            className="min-w-64 flex-1 bg-slate-50"
          />
          <Button type="button" disabled>
            Consultar imágenes
          </Button>
        </div>
        <div className="mt-4">
          <BlockedBanner
            workspace={workspace}
            fallback="Falta un endpoint de consulta de imágenes por código de artículo."
          />
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Migración de imágenes por SKU</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Lote, SKU, portada, fecha y resultado aparecerán cuando la API publique el contrato.
        </p>
        <div className="mt-4">
          <EmptyCapability definition={definition} />
        </div>
      </Card>
    </div>
  );
}

function PrestaShopSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  const channelAction = workspace.actions.find(
    (action) => action.id === 'publish' || action.id === 'publish-prestashop',
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Contrato funcional de consumo PIM</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Operación</th>
                <th className="px-3 py-3">Contrato</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="px-3 py-3 font-semibold text-cdr-ink">Publicar en canal</td>
                <td className="px-3 py-3 text-slate-600">
                  {channelAction?.availability === 'supported'
                    ? `${channelAction.method} ${channelAction.endpoint}`
                    : 'Sin ruta aprobada'}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge
                    tone={channelAction?.availability === 'supported' ? 'success' : 'warning'}
                  >
                    {channelAction?.availability === 'supported' ? 'Disponible' : 'Por confirmar'}
                  </StatusBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <BlockedBanner
            workspace={workspace}
            fallback="Rutas, autenticación, payloads, límites y reintentos siguen pendientes."
          />
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Vista previa de consumo</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Se habilitará al seleccionar un SKU cuando el contrato exponga su payload de canal.
        </p>
        <div className="mt-4">
          <EmptyCapability definition={definition} />
        </div>
        <div className="mt-4 rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">
          Precio y stock permanecen fuera del dato maestro PIM; su procedencia debe definirse en el
          contrato del canal.
        </div>
      </Card>
    </div>
  );
}

function BatchSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  return (
    <div className="space-y-4">
      <BlockedBanner
        workspace={workspace}
        fallback="No existe un endpoint de recepción, consulta o reproceso de lotes AX."
      />
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Cabecera del lote</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {['idLote', 'Fecha de envío', 'Recepción PIM', 'Origen'].map((label) => (
            <div key={label} className="rounded-lg border bg-slate-50 p-4">
              <small className="text-muted-foreground">{label}</small>
              <strong className="mt-1 block text-lg text-cdr-ink">—</strong>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          No se presentan identificadores, fechas o conteos ilustrativos como ejecuciones reales.
        </p>
      </Card>
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Errores por registro</h3>
        <div className="mt-4">
          <EmptyCapability definition={definition} />
        </div>
      </Card>
    </div>
  );
}

function UsersSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  const actor = workspace.metrics.find((metric) => metric.key === 'actor');
  const roles = workspace.rows.filter((row) => row.values.kind === 'Rol');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="min-h-[125px] p-5">
          <small className="text-muted-foreground">Usuario autenticado</small>
          <strong className="mt-2 block break-all text-lg text-cdr-ink">
            {actor ? formatWorkspaceMetric(actor) : '—'}
          </strong>
        </Card>
        <Card className="min-h-[125px] p-5">
          <small className="text-muted-foreground">Roles efectivos</small>
          <strong className="mt-2 block text-2xl text-cdr-ink">{roles.length}</strong>
        </Card>
        <Card className="min-h-[125px] p-5">
          <small className="text-muted-foreground">Directorio administrable</small>
          <strong className="mt-2 block text-2xl text-cdr-ink">—</strong>
        </Card>
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-cdr-ink">Usuarios</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              La sesión es real; el ciclo de altas, bajas e invitaciones aún no está contratado.
            </p>
          </div>
          <Button type="button" disabled>
            Nuevo usuario
          </Button>
        </div>
        <div className="mt-4">
          <EmptyCapability definition={definition} />
        </div>
      </Card>
    </div>
  );
}

function SearchReportSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  return (
    <div className="space-y-4">
      <BlockedBanner
        workspace={workspace}
        fallback="Falta persistir y agregar la telemetría de consultas del buscador."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {['Términos frecuentes', 'Consultas sin resultado'].map((title) => (
          <Card key={title} className="p-5">
            <h3 className="text-base font-semibold text-cdr-ink">{title}</h3>
            <div className="mt-4">
              <EmptyCapability definition={definition} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const settingsCatalogs = [
  'Unidades de medida',
  'Materiales',
  'Sellos',
  'Tipos de identificador',
  'Marcas',
  'Tipos de aplicación',
  'Sinónimos',
] as const;

function SettingsSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Catálogos</h3>
        <div className="mt-3">
          {settingsCatalogs.map((catalog, index) => (
            <div
              key={catalog}
              className={cn(
                'flex items-center justify-between gap-3 border-b px-2 py-3 text-sm last:border-0',
                index === 0 && 'rounded-md bg-orange-50 text-orange-700',
              )}
            >
              <span>
                <strong className="block">{catalog}</strong>
                <small className="text-muted-foreground">Sin endpoint publicado</small>
              </span>
              <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-cdr-ink">Unidades de medida</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              La estructura aprobada se conserva, pero los registros deben provenir de la API.
            </p>
          </div>
          <Button type="button" disabled>
            Agregar parámetro
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          <BlockedBanner
            workspace={workspace}
            fallback="No existen endpoints de lectura o mantenimiento de catálogos maestros."
          />
          <EmptyCapability definition={definition} />
        </div>
      </Card>
    </div>
  );
}

function AuditSurface({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <strong className="flex items-center gap-2">
        <ShieldCheck className="size-4" aria-hidden="true" /> Historial durable
      </strong>
      <p className="mt-1 leading-relaxed opacity-75">
        El historial se consulta mediante la API autenticada de auditoría que se presenta debajo.
        Este workspace solo aporta la identidad y las capacidades efectivas de la sesión.
      </p>
      {workspace.operationalStatus !== 'operational' ? (
        <p className="mt-2 text-xs font-semibold">Estado del workspace: operación parcial.</p>
      ) : null}
    </div>
  );
}

function Actions({
  workspace,
  onRefresh,
  onSupportedAction,
  refreshing,
}: Pick<
  OperationsSecondaryWorkspaceProps,
  'workspace' | 'onRefresh' | 'onSupportedAction' | 'refreshing'
>) {
  const supported = workspace.actions.filter(
    (action): action is Extract<WorkspaceAction, { availability: 'supported' }> =>
      action.availability === 'supported',
  );
  const blocked = workspace.actions.filter(
    (action): action is Extract<WorkspaceAction, { availability: 'blocked' }> =>
      action.availability === 'blocked',
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-semibold text-cdr-ink">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> Operaciones
          soportadas
        </h3>
        <div className="mt-4 space-y-3">
          {supported.length > 0 ? (
            supported.map((action) => {
              const isRefresh = action.id.startsWith('refresh-');
              const canRun = (isRefresh && onRefresh) || onSupportedAction;
              return (
                <div
                  key={action.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="min-w-0">
                    <strong className="block text-sm text-cdr-ink">{action.label}</strong>
                    <code className="mt-1 block break-all text-[11px] text-muted-foreground">
                      {action.method} {action.endpoint}
                    </code>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canRun || Boolean(refreshing)}
                    title={
                      canRun ? undefined : 'El integrador debe conectar el manejador del endpoint'
                    }
                    onClick={() => {
                      if (isRefresh && onRefresh) void onRefresh();
                      else if (onSupportedAction) void onSupportedAction(action);
                    }}
                  >
                    {isRefresh ? (
                      <RefreshCw
                        className={cn('size-3.5', refreshing && 'animate-spin')}
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    )}
                    {isRefresh ? 'Actualizar' : 'Ejecutar'}
                  </Button>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              La API no declaró operaciones soportadas para este workspace.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-semibold text-cdr-ink">
          <LockKeyhole className="size-4 text-amber-600" aria-hidden="true" /> Capacidades
          bloqueadas
        </h3>
        <div className="mt-4 space-y-3">
          {blocked.length > 0 ? (
            blocked.map((action) => (
              <div key={action.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <strong className="flex items-center gap-2 text-sm text-amber-950">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> {action.label}
                </strong>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/75">{action.reason}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              El backend no declaró capacidades bloqueadas.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function RowTable({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => filterWorkspaceRows(workspace.rows, workspace.columns, query),
    [query, workspace.columns, workspace.rows],
  );

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-slate-50/70 p-4">
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar en registros</span>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en los datos publicados por la API…"
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
                  {workspace.columns.map((column) => (
                    <WorkspaceCell key={column.key} row={row} column={column} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5">
          <EmptyCapability definition={definition} />
        </div>
      )}
      <div className="border-t px-4 py-3 text-xs text-muted-foreground">
        {rows.length} de {workspace.totalRows} registros · actualizado{' '}
        {formatWorkspaceDateTime(workspace.generatedAt)}
      </div>
    </Card>
  );
}

function WorkspaceCell({ row, column }: { row: WorkspaceRow; column: WorkspaceColumn }) {
  const formatted = formatWorkspaceCell(row.values[column.key], column);
  return (
    <td className="max-w-80 px-4 py-3 align-top">
      {column.type === 'status' && isCompactWorkspaceStatus(formatted) ? (
        <StatusBadge tone={statusTone(formatted)}>{statusLabel(formatted)}</StatusBadge>
      ) : (
        <span className="break-words text-slate-700">{formatted}</span>
      )}
    </td>
  );
}

function ConnectorCards({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {workspace.rows.map((row) => {
        const system = String(row.values.system ?? row.id);
        const configured = row.values.configured === true;
        const state = String(row.values.state ?? 'Sin estado publicado');
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
            <h3 className="mt-4 font-semibold text-cdr-ink">{system}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{state}</p>
          </Card>
        );
      })}
    </div>
  );
}

function ReportSummary({ workspace }: { workspace: WorkspaceDto }) {
  const sections = useMemo(() => {
    const grouped = new Map<string, WorkspaceRow[]>();
    workspace.rows.forEach((row) => {
      const section = String(row.values.section ?? 'Otros');
      grouped.set(section, [...(grouped.get(section) ?? []), row]);
    });
    return [...grouped.entries()];
  }, [workspace.rows]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sections.map(([section, rows]) => (
        <Card key={section} className="flex min-h-52 flex-col p-5">
          <span className="grid size-10 place-items-center rounded-full bg-orange-100 text-primary">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <h3 className="mt-3 font-semibold text-cdr-ink">{section}</h3>
          <div className="mt-3 flex-1 space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 border-b py-2 last:border-0"
              >
                <span className="min-w-0 break-words text-sm text-slate-700">
                  {String(row.values.indicator ?? row.id)}
                </span>
                <strong className="shrink-0 text-cdr-ink">{String(row.values.value ?? '—')}</strong>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * Presentación de las pantallas operativas secundarias (#25–#36).
 *
 * Este componente no obtiene datos por su cuenta ni simula operaciones. Recibe el WorkspaceDto
 * autenticado del módulo padre y solo habilita una acción cuando el contrato la declara soportada
 * y el integrador proporciona su manejador.
 */
export function OperationsSecondaryWorkspace({
  workspace,
  slug,
  view,
  onRefresh,
  onSupportedAction,
  refreshing = false,
}: OperationsSecondaryWorkspaceProps) {
  const definition = viewDefinitions[view];
  const invalidContext = definition.slug !== slug || workspace.slug !== slug;
  const Icon = definition.icon;

  if (invalidContext) {
    return (
      <Card className="border-red-200 bg-red-50 p-5 text-red-950" role="alert">
        <strong>Vista y workspace incompatibles</strong>
        <p className="mt-1 text-sm opacity-75">
          La vista {view} requiere el workspace {definition.slug}; se recibió {workspace.slug}.
        </p>
      </Card>
    );
  }

  const showRows = workspace.rows.length > 0;
  const showMetrics = ['channels', 'prestashop', 'monitor', 'data'].includes(view);

  return (
    <div className="space-y-5">
      <section className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50/70 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{definition.title}</span>
        </span>
        <StatusBadge
          tone={
            workspace.operationalStatus === 'operational'
              ? 'success'
              : workspace.operationalStatus === 'blocked'
                ? 'danger'
                : 'warning'
          }
        >
          {workspace.operationalStatus === 'operational'
            ? 'Operativo'
            : workspace.operationalStatus === 'blocked'
              ? 'Bloqueado'
              : 'Operación parcial'}
        </StatusBadge>
      </section>

      {showMetrics ? <Metrics workspace={workspace} /> : null}
      <Notices workspace={workspace} />

      {definition.presentation === 'publication' ? (
        <PublicationSurface workspace={workspace} definition={definition} />
      ) : null}
      {definition.presentation === 'table' ? (
        <RowTable workspace={workspace} definition={definition} />
      ) : null}
      {definition.presentation === 'cards' ? (
        showRows ? (
          <ConnectorCards workspace={workspace} />
        ) : (
          <EmptyCapability definition={definition} />
        )
      ) : null}
      {definition.presentation === 'reports' ? (
        showRows ? (
          <ReportSummary workspace={workspace} />
        ) : (
          <EmptyCapability definition={definition} />
        )
      ) : null}
      {definition.presentation === 'capabilities' ? (
        view === 'prestashop' ? (
          <PrestaShopSurface workspace={workspace} definition={definition} />
        ) : view === 'images' ? (
          <ImageMigrationSurface workspace={workspace} definition={definition} />
        ) : view === 'batches' ? (
          <BatchSurface workspace={workspace} definition={definition} />
        ) : view === 'users' ? (
          <UsersSurface workspace={workspace} definition={definition} />
        ) : view === 'audit' ? (
          <AuditSurface workspace={workspace} />
        ) : view === 'searches' ? (
          <SearchReportSurface workspace={workspace} definition={definition} />
        ) : view === 'settings' ? (
          <SettingsSurface workspace={workspace} definition={definition} />
        ) : (
          <EmptyCapability definition={definition} />
        )
      ) : null}

      {view === 'sources' || view === 'monitor' ? (
        <Actions
          workspace={workspace}
          onRefresh={onRefresh}
          onSupportedAction={onSupportedAction}
          refreshing={refreshing}
        />
      ) : null}
    </div>
  );
}
