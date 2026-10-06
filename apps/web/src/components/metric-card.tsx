import { ChevronRight, type LucideIcon } from 'lucide-react';
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
        'relative flex min-h-[125px] items-start gap-3.5 p-[21px]',
        href &&
          'h-full transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-md',
      )}
    >
      <span
        className={cn('grid size-[35px] shrink-0 place-items-center rounded-full', tones[tone])}
      >
        <Icon aria-hidden="true" className="size-[18px]" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <strong className="mt-1 block break-words text-[25px] font-semibold leading-none tracking-[-0.035em] text-cdr-ink">
          {value}
        </strong>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{note}</p>
      </div>
      {href ? (
        <ChevronRight
          aria-hidden="true"
          className="absolute right-4 top-4 size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        />
      ) : null}
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
