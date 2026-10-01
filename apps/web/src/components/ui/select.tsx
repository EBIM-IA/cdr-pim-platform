import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => (
    <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <span className="relative block">
        <select
          ref={ref}
          className={cn(
            'h-11 w-full appearance-none rounded-md border border-input bg-white px-3 pr-9 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-1 disabled:opacity-50',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </label>
  ),
);
Select.displayName = 'Select';
