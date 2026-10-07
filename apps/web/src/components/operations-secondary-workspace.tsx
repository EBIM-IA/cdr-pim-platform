'use client';

import type {
  CodeAffixDto,
  CodeAffixKind,
  CodeAffixSource,
  CodeAffixStatus,
  ParsedProductCodeDto,
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
  Check,
  CheckCircle2,
  Database,
  FileArchive,
  ImageIcon,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

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
import {
  createCodeAffix,
  deactivateCodeAffix,
  listCodeAffixes,
  parseCode,
  updateCodeAffix,
  validateCodeAffix,
} from '@/lib/code-affix-api';

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
          La elegibilidad base comprueba los obligatorios activos. Publicar en un canal todavía
          requiere su política adicional y un adaptador operativo.
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
  'Prefijos y sufijos',
  'Unidades de medida',
  'Materiales',
  'Sellos',
  'Tipos de identificador',
  'Marcas',
  'Tipos de aplicación',
  'Sinónimos',
] as const;

type SettingsCatalog = (typeof settingsCatalogs)[number];

interface CodeAffixFormState {
  kind: CodeAffixKind;
  token: string;
  meaning: string;
  attribute: string;
  impliedValue: string;
  brand: string;
  family: string;
  source: CodeAffixSource;
  confidence: string;
  evidence: string;
  boreRule: 'none' | 'iso_15';
  priority: string;
}

const emptyAffixForm = (): CodeAffixFormState => ({
  kind: 'suffix',
  token: '',
  meaning: '',
  attribute: '',
  impliedValue: '',
  brand: '',
  family: '',
  source: 'manual',
  confidence: '',
  evidence: '',
  boreRule: 'none',
  priority: '0',
});

const kindLabels: Record<CodeAffixKind, string> = {
  prefix: 'Prefijo',
  series: 'Serie',
  suffix: 'Sufijo',
  pattern: 'Patrón',
};

const statusLabels: Record<CodeAffixStatus, string> = {
  draft: 'Borrador',
  pending_validation: 'Por validar',
  validated: 'Validado',
  rejected: 'Rechazado',
};

function SettingsSurface({
  workspace,
  definition,
}: {
  workspace: WorkspaceDto;
  definition: ViewDefinition;
}) {
  const [catalog, setCatalog] = useState<SettingsCatalog>('Prefijos y sufijos');
  const [rules, setRules] = useState<CodeAffixDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [kind, setKind] = useState<CodeAffixKind | ''>('');
  const [status, setStatus] = useState<CodeAffixStatus | ''>('');
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<CodeAffixDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CodeAffixFormState>(emptyAffixForm);
  const [saving, setSaving] = useState(false);
  const [parseInput, setParseInput] = useState('');
  const [parseBrand, setParseBrand] = useState('');
  const [parseFamily, setParseFamily] = useState('');
  const [parsed, setParsed] = useState<ParsedProductCodeDto | null>(null);
  const [parsing, setParsing] = useState(false);
  const canManage = workspace.rows.some(
    (row) =>
      row.values.kind === 'Rol' &&
      ['ADMINISTRADOR', 'ADMIN'].includes(String(row.values.grant ?? '').toUpperCase()),
  );

  useEffect(() => {
    if (catalog !== 'Prefijos y sufijos') return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void listCodeAffixes(
      {
        includeInactive: false,
        ...(appliedQuery ? { q: appliedQuery } : {}),
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
      },
      controller.signal,
    )
      .then(setRules)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'No fue posible cargar el catálogo.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appliedQuery, catalog, kind, refresh, status]);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(emptyAffixForm());
  };
  const openEdit = (rule: CodeAffixDto) => {
    setCreating(false);
    setEditing(rule);
    setForm({
      kind: rule.kind,
      token: rule.token,
      meaning: rule.meaning,
      attribute: rule.attribute ?? '',
      impliedValue: rule.impliedValue ?? '',
      brand: rule.brand ?? '',
      family: rule.family ?? '',
      source: rule.source,
      confidence: rule.confidence === null ? '' : String(rule.confidence),
      evidence: rule.evidence ?? '',
      boreRule: rule.boreRule,
      priority: String(rule.priority),
    });
  };
  const closeEditor = () => {
    setCreating(false);
    setEditing(null);
  };
  const mutateForm = <K extends keyof CodeAffixFormState>(key: K, value: CodeAffixFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      kind: form.kind,
      token: form.token,
      meaning: form.meaning,
      attribute: form.attribute.trim() || null,
      impliedValue: form.impliedValue.trim() || null,
      brand: form.brand.trim() || null,
      family: form.family.trim() || null,
      source: form.source,
      confidence: form.confidence.trim() ? Number(form.confidence) : null,
      evidence: form.evidence.trim() || null,
      boreRule: form.boreRule,
      priority: Number(form.priority),
    };
    try {
      if (editing) {
        await updateCodeAffix(editing.id, { ...payload, expectedUpdatedAt: editing.updatedAt });
      } else {
        await createCodeAffix(payload);
      }
      closeEditor();
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible guardar la regla.');
    } finally {
      setSaving(false);
    }
  };

  const decide = async (rule: CodeAffixDto, decision: 'validated' | 'rejected') => {
    setError('');
    try {
      await validateCodeAffix(rule.id, {
        decision,
        expectedUpdatedAt: rule.updatedAt,
      });
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible registrar la decisión.');
    }
  };

  const deactivate = async (rule: CodeAffixDto) => {
    setError('');
    try {
      await deactivateCodeAffix(rule.id);
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible desactivar la regla.');
    }
  };

  const runParser = async () => {
    if (!parseInput.trim()) return;
    setParsing(true);
    setError('');
    try {
      setParsed(
        await parseCode({
          code: parseInput,
          ...(parseBrand.trim() ? { brand: parseBrand.trim() } : {}),
          ...(parseFamily.trim() ? { family: parseFamily.trim() } : {}),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible interpretar el código.');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="p-5">
        <h3 className="text-base font-semibold text-cdr-ink">Catálogos</h3>
        <div className="mt-3 space-y-1">
          {settingsCatalogs.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setCatalog(item)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left text-sm',
                item === catalog
                  ? 'bg-orange-50 text-orange-700'
                  : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span>
                <strong className="block">{item}</strong>
                <small className="text-muted-foreground">
                  {item === 'Prefijos y sufijos'
                    ? `${rules.length} reglas persistidas`
                    : 'Pendiente'}
                </small>
              </span>
              <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      </Card>
      {catalog !== 'Prefijos y sufijos' ? (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-cdr-ink">{catalog}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Este catálogo todavía no tiene un contrato de mantenimiento aprobado.
          </p>
          <div className="mt-4">
            <EmptyCapability definition={definition} />
          </div>
        </Card>
      ) : (
        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-cdr-ink">Prefijos y sufijos</h3>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  Reglas persistidas y trazables. Una regla solo participa en la lectura después de
                  ser validada con evidencia; no se cargan sugerencias IA como hechos.
                </p>
              </div>
              <Button type="button" onClick={openCreate} disabled={!canManage}>
                <Plus className="size-4" aria-hidden="true" /> Agregar regla
              </Button>
            </div>
            {!canManage ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                Solo ADMINISTRADOR puede crear, editar, validar o desactivar reglas.
              </p>
            ) : null}
            {error ? (
              <p
                className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-cdr-ink">Probar la lectura de un código</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                aria-label="Código de producto a interpretar"
                value={parseInput}
                onChange={(event) => setParseInput(event.target.value)}
                placeholder="Ej. 6205-2RS-C3"
                className="min-w-64 flex-1 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void runParser()}
                disabled={parsing || !parseInput.trim()}
              >
                {parsing ? 'Interpretando…' : 'Interpretar'}
              </Button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Marca para interpretar el código"
                value={parseBrand}
                onChange={(event) => setParseBrand(event.target.value)}
                placeholder="Marca (opcional, limita reglas específicas)"
              />
              <Input
                aria-label="Familia para interpretar el código"
                value={parseFamily}
                onChange={(event) => setParseFamily(event.target.value)}
                placeholder="Familia (opcional, limita reglas específicas)"
              />
            </div>
            {parsed ? (
              <div className="mt-4 space-y-2" aria-live="polite">
                <p className="text-xs text-muted-foreground">
                  Código normalizado: <code>{parsed.normalizedCode}</code>
                </p>
                <div className="flex flex-wrap gap-2">
                  {parsed.segments.map((segment, index) => (
                    <span
                      key={`${segment.kind}-${index}`}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs',
                        segment.ruleId
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                          : 'border-dashed bg-slate-50 text-slate-700',
                      )}
                    >
                      <strong className="font-mono">{segment.text}</strong>
                      <span className="ml-2">{segment.meaning ?? 'Sin regla validada'}</span>
                      {segment.boreMillimeters !== null ? (
                        <small className="ml-2 font-semibold">
                          {segment.boreMillimeters} mm · ISO 15
                        </small>
                      ) : null}
                      {segment.evidence ? (
                        <small className="mt-1 block opacity-70">{segment.evidence}</small>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          {(creating || editing) && canManage ? (
            <Card className="p-5">
              <form onSubmit={(event) => void submit(event)} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-cdr-ink">
                    {editing ? `Editar ${editing.token}` : 'Nueva regla'}
                  </h3>
                  <Button type="button" variant="ghost" size="sm" onClick={closeEditor}>
                    Cancelar
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    Tipo
                    <select
                      className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm"
                      value={form.kind}
                      onChange={(event) => mutateForm('kind', event.target.value as CodeAffixKind)}
                    >
                      {Object.entries(kindLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Código o patrón
                    <Input
                      required
                      className="mt-1 font-mono"
                      value={form.token}
                      onChange={(event) => mutateForm('token', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Fuente
                    <select
                      className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm"
                      value={form.source}
                      onChange={(event) =>
                        mutateForm('source', event.target.value as CodeAffixSource)
                      }
                    >
                      {['manual', 'manufacturer', 'standard', 'import', 'ai_suggestion'].map(
                        (value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
                    Significado
                    <Input
                      required
                      className="mt-1"
                      value={form.meaning}
                      onChange={(event) => mutateForm('meaning', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Atributo
                    <Input
                      className="mt-1"
                      value={form.attribute}
                      onChange={(event) => mutateForm('attribute', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Valor implícito
                    <Input
                      className="mt-1"
                      value={form.impliedValue}
                      onChange={(event) => mutateForm('impliedValue', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Familia
                    <Input
                      className="mt-1"
                      value={form.family}
                      onChange={(event) => mutateForm('family', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Marca
                    <Input
                      className="mt-1"
                      value={form.brand}
                      onChange={(event) => mutateForm('brand', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Confianza (0–1)
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.001"
                      className="mt-1"
                      value={form.confidence}
                      onChange={(event) => mutateForm('confidence', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Prioridad
                    <Input
                      type="number"
                      min="0"
                      max="1000"
                      className="mt-1"
                      value={form.priority}
                      onChange={(event) => mutateForm('priority', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Regla de agujero
                    <select
                      className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm"
                      value={form.boreRule}
                      onChange={(event) =>
                        mutateForm('boreRule', event.target.value as 'none' | 'iso_15')
                      }
                    >
                      <option value="none">No aplica</option>
                      <option value="iso_15" disabled={form.kind !== 'series'}>
                        ISO 15 (solo serie)
                      </option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
                    Evidencia
                    <textarea
                      required
                      className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm"
                      value={form.evidence}
                      onChange={(event) => mutateForm('evidence', event.target.value)}
                      placeholder="Norma, catálogo o referencia verificable"
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar regla'}
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap gap-2 border-b bg-slate-50/70 p-4">
              <Input
                aria-label="Buscar reglas"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Código, significado, marca o familia"
                className="min-w-64 flex-1 bg-white"
              />
              <select
                aria-label="Filtrar por tipo"
                className="h-10 rounded-md border bg-white px-3 text-sm"
                value={kind}
                onChange={(event) => setKind(event.target.value as CodeAffixKind | '')}
              >
                <option value="">Todos los tipos</option>
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por estado"
                className="h-10 rounded-md border bg-white px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as CodeAffixStatus | '')}
              >
                <option value="">Todos los estados</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={() => setAppliedQuery(query.trim())}>
                Buscar
              </Button>
            </div>
            {loading ? (
              <p className="p-8 text-center text-sm text-muted-foreground" role="status">
                Cargando reglas…
              </p>
            ) : rules.length === 0 ? (
              <div className="p-8 text-center" role="status">
                <strong>No hay reglas persistidas</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Agrega una regla con evidencia; no se precargan sugerencias como verdad.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Significado</th>
                      <th className="px-4 py-3">Fuente</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-orange-50/40">
                        <td className="px-4 py-3 font-mono font-semibold">{rule.token}</td>
                        <td className="px-4 py-3">{kindLabels[rule.kind]}</td>
                        <td className="max-w-md px-4 py-3">
                          <span className="block">{rule.meaning}</span>
                          <small className="text-muted-foreground">
                            {rule.evidence ?? 'Sin evidencia'}
                          </small>
                        </td>
                        <td className="px-4 py-3">
                          {rule.source}
                          {rule.confidence !== null ? (
                            <small className="block text-muted-foreground">
                              {Math.round(rule.confidence * 100)} %
                            </small>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              rule.status === 'validated'
                                ? 'success'
                                : rule.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {statusLabels[rule.status]}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={!canManage}
                              aria-label={`Editar ${rule.token}`}
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" />
                            </Button>
                            {rule.status !== 'validated' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={!canManage || !rule.evidence}
                                aria-label={`Validar ${rule.token}`}
                                onClick={() => void decide(rule, 'validated')}
                              >
                                <Check className="size-3.5" aria-hidden="true" />
                              </Button>
                            ) : null}
                            {rule.status !== 'rejected' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={!canManage}
                                aria-label={`Rechazar ${rule.token}`}
                                onClick={() => void decide(rule, 'rejected')}
                              >
                                <X className="size-3.5" aria-hidden="true" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={!canManage}
                              aria-label={`Desactivar ${rule.token}`}
                              onClick={() => void deactivate(rule)}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              {rules.length} reglas visibles · datos persistidos por la API
            </div>
          </Card>
        </div>
      )}
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
