import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary px-4 text-primary-foreground hover:bg-primary/90',
        secondary:
          'border-secondary bg-secondary px-4 text-secondary-foreground hover:bg-secondary/80',
        outline: 'border-border bg-white px-4 text-foreground hover:bg-muted',
        ghost: 'border-transparent bg-transparent px-3 text-foreground hover:bg-muted',
        dark: 'border-cdr-ink bg-cdr-ink px-4 text-white hover:bg-cdr-ink/90',
        destructive:
          'border-destructive bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10',
        sm: 'min-h-8 px-3 text-xs',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
