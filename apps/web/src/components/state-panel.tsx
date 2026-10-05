import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const variants: Record<'error' | 'empty' | 'offline', { icon: LucideIcon; className: string }> = {
  error: { icon: AlertTriangle, className: 'bg-red-100 text-red-600' },
  empty: { icon: Inbox, className: 'bg-orange-100 text-primary' },
  offline: { icon: WifiOff, className: 'bg-slate-200 text-slate-600' },
};

export function StatePanel({
  variant,
  title,
  description,
  actionLabel,
  onAction,
}: {
  variant: 'error' | 'empty' | 'offline';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { icon: Icon, className } = variants[variant];
  return (
    <Card
      className="flex min-h-64 flex-col items-center justify-center p-6 text-center"
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <span className={cn('mb-4 grid size-12 place-items-center rounded-full', className)}>
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button className="mt-5" onClick={onAction}>
          {variant === 'error' ? <RefreshCw aria-hidden="true" className="size-4" /> : null}
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}
