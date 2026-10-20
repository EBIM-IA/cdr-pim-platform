import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-3 flex flex-col items-start justify-between gap-2.5 md:flex-row md:gap-5">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold leading-tight tracking-[-0.035em] text-cdr-ink">
          {title}
        </h1>
        <p className="mt-0.5 max-w-4xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap gap-1.5 md:w-auto md:justify-end [&_a]:min-h-8 [&_a]:text-xs [&_button]:min-h-8 [&_button]:text-xs">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
