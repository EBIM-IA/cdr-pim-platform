import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Route,
  ShieldAlert,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatusBadge, type BadgeTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CapabilityStatus, ModuleDefinition, ModuleSlug } from '@/lib/module-definitions';

const capabilityStatus: Record<
  CapabilityStatus,
  {
    label: string;
    tone: BadgeTone;
    icon: LucideIcon;
    iconClassName: string;
  }
> = {
  available: {
    label: 'Base disponible',
    tone: 'success',
    icon: CheckCircle2,
    iconClassName: 'bg-emerald-100 text-emerald-700',
  },
  confirmed: {
    label: 'Regla confirmada',
    tone: 'info',
    icon: BadgeCheck,
    iconClassName: 'bg-cyan-100 text-cyan-700',
  },
  next: {
    label: 'Próximo incremento',
    tone: 'info',
    icon: Clock3,
    iconClassName: 'bg-blue-100 text-blue-700',
  },
  blocked: {
    label: 'Dependencia pendiente',
    tone: 'warning',
    icon: LockKeyhole,
    iconClassName: 'bg-amber-100 text-amber-700',
  },
};

const catalogRelevantModules: readonly ModuleSlug[] = [
  'templates',
  'documents',
  'imports',
  'quality',
  'publication',
];

export function ModuleWorkspace({ definition }: { definition: ModuleDefinition }) {
  const linksToCatalog = catalogRelevantModules.includes(definition.slug);

  return (
    <>
      <PageHeader
        eyebrow={definition.eyebrow}
        title={definition.label}
        description={definition.description}
        actions={
          linksToCatalog ? (
            <Button asChild variant="outline">
              <Link href="/products">
                Consultar catálogo
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ScreenGuide
        objective={definition.objective}
        actions={definition.actions}
        actionsLabel="Alcance previsto"
        dataSource={definition.dataSource}
        limitation={definition.limitation}
      />

      <section
        aria-labelledby="module-status-title"
        className="mb-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:p-5"
        role="status"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-slate-700 shadow-sm">
          <ShieldAlert aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="module-status-title" className="font-semibold text-cdr-ink">
            Espacio preparado; operación todavía limitada
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Esta pantalla presenta el alcance real del módulo sin inventar registros ni habilitar
            acciones que el backend aún no soporta. «Base disponible» identifica implementación
            existente; «Regla confirmada» identifica un acuerdo funcional todavía no operativo.
          </p>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
        <section aria-labelledby="module-capabilities-title">
          <div className="mb-3">
            <h2 id="module-capabilities-title" className="text-lg font-semibold text-cdr-ink">
              Capacidades del módulo
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estado de cada capacidad según los contratos disponibles hoy.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {definition.capabilities.map((capability) => {
              const status = capabilityStatus[capability.status];
              const Icon = status.icon;

              return (
                <li key={capability.title} className="min-w-0">
                  <Card className="h-full">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-lg ${status.iconClassName}`}
                        >
                          <Icon aria-hidden="true" className="size-5" />
                        </span>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </div>
                      <CardTitle className="pt-2 text-base">{capability.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {capability.description}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <aside aria-labelledby="module-dependencies-title">
          <Card>
            <CardHeader>
              <span className="mb-2 grid size-10 place-items-center rounded-lg bg-orange-100 text-primary">
                <Route aria-hidden="true" className="size-5" />
              </span>
              <CardTitle id="module-dependencies-title">Dependencias para continuar</CardTitle>
              <CardDescription>
                Condiciones necesarias antes de habilitar escritura u operación real.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {definition.dependencies.map((dependency) => (
                  <li
                    key={dependency}
                    className="flex items-start gap-3 text-sm leading-relaxed text-slate-700"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{dependency}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
