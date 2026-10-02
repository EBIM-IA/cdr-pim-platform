import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-slate-100 text-slate-700',
        success: 'bg-emerald-100 text-emerald-700',
        warning: 'bg-amber-100 text-amber-700',
        danger: 'bg-red-100 text-red-700',
        info: 'bg-blue-100 text-blue-700',
        purple: 'bg-violet-100 text-violet-700',
        orange: 'bg-orange-100 text-orange-700',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function statusTone(status: string): BadgeTone {
  const normalized = status.toLocaleLowerCase('es');
  if (normalized === 'approved') return 'success';
  if (normalized === 'published') return 'success';
  if (normalized === 'incomplete') return 'danger';
  if (normalized === 'review' || normalized === 'in_review') return 'warning';
  if (normalized === 'enrichment' || normalized === 'draft') return 'info';
  if (normalized === 'inactive' || normalized === 'archived') return 'neutral';
  if (/aprob|approved|complet|activo|active|publicable|correcto/.test(normalized)) return 'success';
  if (/error|rechaz|incompleto|incomplete|bloqueado/.test(normalized)) return 'danger';
  if (/revisi|review|pendiente|advertencia|proceso/.test(normalized)) return 'warning';
  if (/enriquec|enrichment|borrador|draft/.test(normalized)) return 'info';
  if (/conflicto|ia/.test(normalized)) return 'purple';
  return 'neutral';
}

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  ENRICHMENT: 'Enriquecimiento',
  REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  INCOMPLETE: 'Incompleto',
  INACTIVE: 'Inactivo',
  IN_REVIEW: 'En revisión',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

export function statusLabel(status: string) {
  return statusLabels[status.toLocaleUpperCase('es')] ?? status;
}

export function StatusBadge({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}
