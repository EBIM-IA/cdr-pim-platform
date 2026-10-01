import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const tones = {
  orange: 'bg-orange-100 text-primary',
  green: 'bg-emerald-100 text-emerald-600',
  red: 'bg-red-100 text-red-500',
  blue: 'bg-blue-100 text-blue-600',
  purple: 'bg-violet-100 text-violet-600',
};

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'orange',
  href,
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  href?: string;
}) {
  const content = (
    <Card
      className={cn(
        'flex min-h-32 items-start gap-3 p-4 sm:p-5',
        href &&
          'h-full transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-md',
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', tones[tone])}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <strong className="mt-1 block break-words text-2xl font-semibold tracking-tight text-cdr-ink sm:text-3xl">
          {value}
        </strong>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p>
      </div>
    </Card>
  );

  return href ? (
    <Link
      href={href}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-2"
      aria-label={`${label}: ${String(value)}. Ver productos`}
    >
      {content}
    </Link>
  ) : (
    content
  );
}
