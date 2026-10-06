'use client';

import type { WorkspaceAction, WorkspaceDto } from '@cdr/contracts';
import {
  AlertTriangle,
  Bot,
  Database,
  FileCheck2,
  FileSearch,
  GitCompareArrows,
  Layers3,
  ListChecks,
  PackageSearch,
  ScanSearch,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export type QualitySecondaryView =
  'extraction' | 'commercial' | 'duplicates' | 'review' | 'sources' | 'conflict';

export interface QualitySecondaryWorkspaceProps {
  view: QualitySecondaryView;
  workspace: WorkspaceDto;
}

function blockedActions(
  workspace: WorkspaceDto,
): Extract<WorkspaceAction, { availability: 'blocked' }>[] {
  return workspace.actions.filter(
    (action): action is Extract<WorkspaceAction, { availability: 'blocked' }> =>
      action.availability === 'blocked',
  );
}

function BlockingNotice({
  workspace,
  title,
  fallback,
}: {
  workspace: WorkspaceDto;
  title: string;
  fallback: string;
}) {
  const reasons = blockedActions(workspace);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <strong className="text-sm">{title}</strong>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
            {reasons[0]?.reason ?? fallback}
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  number,
  title,
  description,
  active = false,
}: {
  number: number;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
          active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {number}
      </span>
      <span>
        <strong className="block text-sm text-cdr-ink">{title}</strong>
        <small className="mt-0.5 block leading-relaxed text-muted-foreground">{description}</small>
      </span>
    </li>
  );
}

function EmptyMetric({ label, note }: { label: string; note: string }) {
  return (
    <Card className="min-h-28 p-4">
      <small className="text-muted-foreground">{label}</small>
      <strong className="mt-2 block text-2xl text-slate-400">—</strong>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

function ProductContextBar({ document = false }: { document?: boolean }) {
  return (
    <Card className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end">
      <div className="min-w-0 lg:w-[42%]">
        <small className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          SKU en contexto
        </small>
        <strong className="mt-1 block text-lg text-cdr-ink">Sin SKU seleccionado</strong>
        <p className="text-xs text-muted-foreground">
          El backend de calidad no publica todavía un contexto de revisión.
        </p>
      </div>
      <label className="min-w-0 flex-1 text-[10px] font-semibold text-muted-foreground">
        Cambiar SKU
        <Input
          className="mt-1"
          value="Selecciona un producto desde el catálogo"
          disabled
          readOnly
        />
      </label>
      <Button asChild variant="outline">
        <Link href="/products">Ver catálogo</Link>
      </Button>
      {document ? (
        <label className="min-w-[210px] text-[10px] font-semibold text-muted-foreground">
          Documento
          <Input className="mt-1" value="Sin documento disponible" disabled readOnly />
        </label>
      ) : null}
    </Card>
  );
}

function ExtractionWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="space-y-5">
      <BlockingNotice
        workspace={workspace}
        title="Extracción documental todavía no disponible"
        fallback="Faltan el contrato de documentos, candidatos, evidencia, confianza y decisiones humanas auditables."
      />
      <ProductContextBar document />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-cdr-ink">Evidencia documental</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                El documento debe estar asociado a un SKU persistido.
              </p>
            </div>
            <StatusBadge tone="warning">Sin documento seleccionado</StatusBadge>
          </div>
          <div className="mt-5 grid min-h-72 place-items-center rounded-xl border border-dashed bg-slate-50 p-6 text-center">
            <div>
              <FileSearch className="mx-auto size-10 text-slate-300" aria-hidden="true" />
              <strong className="mt-3 block text-sm">Vista previa no disponible</strong>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                La aplicación no simula una ficha técnica ni zonas de evidencia si el backend no
                entregó un activo documental.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link href="/documents">Ir a imágenes y documentos</Link>
          </Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-violet-100 text-violet-700">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold text-cdr-ink">Atributos sugeridos</h3>
              <p className="text-xs text-muted-foreground">0 revisados · sin ejecución de IA</p>
            </div>
          </div>
          <ol className="mt-6 space-y-5">
            <FlowStep
              number={1}
              title="Seleccionar documento"
              description="El activo debe tener procedencia, tipo y SKU asociados."
              active
            />
            <FlowStep
              number={2}
              title="Extraer candidatos con evidencia"
              description="Cada valor necesita página, zona, fragmento, confianza y proveedor."
            />
            <FlowStep
              number={3}
              title="Aceptar o rechazar"
              description="Una persona decide; la sugerencia nunca sobrescribe valores aprobados."
            />
          </ol>
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled>
              Rechazar
            </Button>
            <Button disabled>Aceptar sugerencia</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CommercialWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="space-y-5">
      <BlockingNotice
        workspace={workspace}
        title="Generación comercial pendiente de contrato"
        fallback="No existe un endpoint para generar, versionar, comparar o aprobar contenido comercial con evidencia técnica."
      />
      <ProductContextBar />
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-violet-100 text-violet-700">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold text-cdr-ink">Comparación técnica y comercial</h3>
              <p className="text-xs text-muted-foreground">
                La propuesta solo podrá usar hechos aprobados de la ficha del SKU.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <section className="rounded-xl border bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Descripción técnica aprobada</h4>
              <StatusBadge tone="neutral">Sin SKU en contexto</StatusBadge>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Selecciona un producto desde su ficha cuando el flujo de descripción comercial esté
              disponible. No se muestra contenido técnico de ejemplo.
            </p>
          </section>
          <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-violet-950">Propuesta IA</h4>
              <StatusBadge tone="warning">Bloqueada</StatusBadge>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Aquí se mostrará la versión generada, sus diferencias, afirmaciones sin respaldo y
              estado de aprobación cuando exista persistencia.
            </p>
          </section>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t bg-slate-50/60 p-4">
          <Button asChild variant="outline">
            <Link href="/products">Seleccionar producto</Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              Regenerar
            </Button>
            <Button disabled>Aprobar contenido</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DuplicatesWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EmptyMetric label="Alertas abiertas" note="Motor de candidatos pendiente" />
        <EmptyMetric label="Resueltas" note="Sin decisiones persistidas" />
        <EmptyMetric label="Ya agrupados por ERP" note="Sin comparación disponible" />
        <Card className="min-h-28 p-4">
          <small className="text-muted-foreground">Fusiones automáticas</small>
          <strong className="mt-2 block text-2xl text-emerald-600">0</strong>
          <p className="mt-1 text-xs text-muted-foreground">El PIM nunca fusiona SKU</p>
        </Card>
      </div>
      <BlockingNotice
        workspace={workspace}
        title="No existe un motor de posibles duplicados"
        fallback="Faltan criterios de similitud, candidatos persistidos, comparación y decisión humana auditada."
      />
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="flex items-center gap-3">
            <GitCompareArrows className="size-5 text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-cdr-ink">Alertas para revisión humana</h3>
              <p className="text-xs text-muted-foreground">
                Duplicado probable no equivale a código unificador y nunca modifica la identidad.
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b bg-slate-50 uppercase tracking-wide text-muted-foreground">
              <tr>
                {[
                  'SKU A',
                  'SKU B',
                  'Motivo de similitud',
                  'Similitud',
                  'Código unificador',
                  'Estado',
                  'Acción',
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  <GitCompareArrows
                    className="mx-auto mb-3 size-8 text-slate-300"
                    aria-hidden="true"
                  />
                  <strong className="block text-sm text-cdr-ink">Sin candidatos disponibles</strong>
                  <span className="mt-1 block">
                    El backend no publica pares, similitud ni motivos de coincidencia.
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border-t bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-950">
          Cada SKU conserva su código de artículo. Una corrección de agrupación debe originarse en
          ERP y llegar mediante el código unificador.
        </div>
      </Card>
    </div>
  );
}

function ReviewWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EmptyMetric label="Pendientes" note="Cola de revisión no implementada" />
        <EmptyMetric label="Aprobadas" note="Sin decisiones persistidas" />
        <EmptyMetric label="Con ajuste" note="Sin solicitudes persistidas" />
        <EmptyMetric label="Creadas en la sesión" note="No se simulan solicitudes" />
      </div>
      <BlockingNotice
        workspace={workspace}
        title="Bandeja pendiente de modelo y permisos"
        fallback="Faltan solicitudes, asignación, decisión, motivo, estado y auditoría de aprobación."
      />
      <div className="flex flex-wrap gap-2" aria-label="Filtros de estado">
        {['Pendientes', 'Aprobadas', 'Con ajuste', 'Todas'].map((label, index) => (
          <Button key={label} variant={index === 0 ? 'default' : 'outline'} size="sm" disabled>
            {label} · —
          </Button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <div className="flex items-center gap-3">
              <ListChecks className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-semibold text-cdr-ink">Solicitudes</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b bg-slate-50 uppercase tracking-wide text-muted-foreground">
                <tr>
                  {['Solicitud', 'SKU', 'Solicitante', 'Prioridad', 'Estado', 'Acción'].map(
                    (heading) => (
                      <th key={heading} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    Sin solicitudes reales. La vista se activará cuando el backend publique una cola
                    autenticada.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-cdr-ink">Revisión individual</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Al seleccionar una solicitud se compararán valor anterior, propuesta, evidencia,
            solicitante y trazabilidad.
          </p>
          <div className="mt-6 grid gap-3 rounded-xl border bg-slate-50 p-4 text-xs text-muted-foreground">
            <span>Registro: —</span>
            <span>Solicitante: —</span>
            <span>Prioridad: —</span>
            <span>Estado: —</span>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" disabled>
              Solicitar ajuste
            </Button>
            <Button disabled>Aprobar</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SourcesWorkspace({
  workspace,
  conflict = false,
}: {
  workspace: WorkspaceDto;
  conflict?: boolean;
}) {
  const sourceCards = ['Preferida', 'Alternativa 1', 'Alternativa 2', 'Alternativa 3'];
  return (
    <div className="space-y-5">
      <BlockingNotice
        workspace={workspace}
        title={
          conflict ? 'Resolución de conflictos no disponible' : 'Matriz de prioridad no disponible'
        }
        fallback={
          conflict
            ? 'Faltan candidatos por fuente, prioridad aplicable, decisión con motivo y trazabilidad.'
            : 'Falta una proyección backend de prioridades de enriquecimiento por categoría o plantilla.'
        }
      />
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-[10px] font-semibold text-muted-foreground">
          {conflict ? 'Conflicto' : 'Categoría / plantilla'}
          <Input
            className="mt-1"
            value={conflict ? 'Sin conflictos persistidos' : 'Sin matriz publicada por la API'}
            disabled
            readOnly
          />
        </label>
        <StatusBadge tone="info">
          {conflict ? 'Sin candidato seleccionado' : 'Matriz de enriquecimiento'}
        </StatusBadge>
      </Card>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-blue-100 text-blue-700">
              {conflict ? (
                <ShieldAlert className="size-5" aria-hidden="true" />
              ) : (
                <Layers3 className="size-5" aria-hidden="true" />
              )}
            </span>
            <div>
              <h3 className="font-semibold text-cdr-ink">
                {conflict ? 'Candidatos por fuente' : 'Prioridad de fuentes por categoría'}
              </h3>
              <p className="text-xs text-muted-foreground">
                ERP aporta identidad y datos base; no compite con las fuentes de enriquecimiento.
              </p>
            </div>
          </div>
          <StatusBadge tone="warning">Configuración pendiente</StatusBadge>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sourceCards.map((label, index) => (
            <div key={label} className="rounded-xl border bg-slate-50 p-4">
              <small className="text-muted-foreground">
                Prioridad {index + 1} · {label}
              </small>
              <strong className="mt-3 block text-sm text-slate-400">Sin fuente configurada</strong>
              <p className="mt-2 text-xs text-muted-foreground">Sin candidato ni evidencia</p>
            </div>
          ))}
        </div>
      </Card>

      {conflict ? (
        <Card className="p-5">
          <div className="mb-5 border-b pb-4">
            <h3 className="font-semibold text-cdr-ink">SKU y atributo en conflicto</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sin registro seleccionado · los datos base ERP se conservarán fuera de la competencia
              entre fuentes.
            </p>
          </div>
          <h3 className="font-semibold text-cdr-ink">Decisión y trazabilidad</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Selección propuesta', '—'],
              ['Valor vigente elegido', '—'],
              ['Override humano', '—'],
              ['Motivo', '—'],
              ['Estado', 'Sin conflicto seleccionado'],
              ['Fuentes conservadas', '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <small className="text-muted-foreground">{label}</small>
                <strong className="mt-1 block text-sm">{value}</strong>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button disabled>Editar y resolver conflicto</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Database className="size-5 text-blue-700" aria-hidden="true" />
                <h3 className="font-semibold text-cdr-ink">Datos base ERP</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Llegan por PUSH y son de solo lectura. La matriz de enriquecimiento no debe
                sobrescribir la identidad recibida de Sismetic / AX.
              </p>
              <StatusBadge tone="info" className="mt-4">
                Solo lectura
              </StatusBadge>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <FileCheck2 className="size-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-cdr-ink">Fuentes de enriquecimiento</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                La matriz mostrará el orden por plantilla cuando la API publique fuentes, vigencia y
                precedencia confirmadas.
              </p>
              <Button variant="outline" className="mt-4" disabled>
                Guardar reglas
              </Button>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <div className="border-b p-5">
              <h3 className="font-semibold text-cdr-ink">Matriz de prioridades por plantilla</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                La estructura queda preparada; los rangos se mostrarán cuando provengan del backend.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b bg-slate-50 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {['Categoría', 'Aplicación', 'Fabricante', 'Archivo', 'TecDoc', 'Manual'].map(
                      (heading) => (
                        <th key={heading} className="px-4 py-3 font-semibold">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                      La API aún no entrega prioridades por categoría o plantilla.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const renderers: Record<QualitySecondaryView, (workspace: WorkspaceDto) => ReactNode> = {
  extraction: (workspace) => <ExtractionWorkspace workspace={workspace} />,
  commercial: (workspace) => <CommercialWorkspace workspace={workspace} />,
  duplicates: (workspace) => <DuplicatesWorkspace workspace={workspace} />,
  review: (workspace) => <ReviewWorkspace workspace={workspace} />,
  sources: (workspace) => <SourcesWorkspace workspace={workspace} />,
  conflict: (workspace) => <SourcesWorkspace workspace={workspace} conflict />,
};

/**
 * Secondary IA/quality screens from the approved reference. The component intentionally receives
 * the live quality workspace: visual affordances remain disabled until that contract advertises a
 * supported operation, so a design-complete screen cannot be mistaken for a working backend.
 */
export function QualitySecondaryWorkspace({ view, workspace }: QualitySecondaryWorkspaceProps) {
  return renderers[view](workspace);
}

export const qualitySecondaryNavigation = [
  {
    id: 'extraction',
    label: 'Extracción IA',
    title: 'Revisión de extracción IA',
    description: 'Evidencia documental y decisiones humanas por atributo.',
    icon: ScanSearch,
  },
  {
    id: 'commercial',
    label: 'Descripción comercial',
    title: 'Descripción comercial con IA',
    description: 'Comparación entre la ficha técnica aprobada y la propuesta comercial.',
    icon: Sparkles,
  },
  {
    id: 'duplicates',
    label: 'Duplicados',
    title: 'Posibles duplicados',
    description: 'Candidatos para comparación sin fusionar ni modificar identidades.',
    icon: PackageSearch,
  },
  {
    id: 'review',
    label: 'Bandeja',
    title: 'Bandeja de revisión y aprobación',
    description: 'Solicitudes y decisiones humanas con motivo y trazabilidad.',
    icon: ListChecks,
  },
  {
    id: 'sources',
    label: 'Prioridad de fuentes',
    title: 'Prioridad de fuentes',
    description: 'Precedencia de enriquecimiento por categoría o plantilla.',
    icon: Layers3,
  },
  {
    id: 'conflict',
    label: 'Resolver conflicto',
    title: 'Resolver conflicto de fuentes',
    description: 'Candidatos, propuesta y override humano documentado.',
    icon: ShieldAlert,
  },
] as const;

export const qualitySecondaryViewIds = qualitySecondaryNavigation.map((item) => item.id);

export function isQualitySecondaryView(value: string): value is QualitySecondaryView {
  return qualitySecondaryViewIds.some((id) => id === value);
}
