import { cn, clamp } from '@/lib/utils';

interface ProgressProps {
  value: number;
  className?: string;
  label?: string;
}

export function Progress({ value, className, label }: ProgressProps) {
  const safeValue = clamp(value);
  const color = safeValue >= 90 ? 'bg-cdr-green' : safeValue >= 70 ? 'bg-cdr-amber' : 'bg-cdr-red';
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200', className)}
      role="progressbar"
      aria-label={label ?? 'Completitud'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', color)}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
