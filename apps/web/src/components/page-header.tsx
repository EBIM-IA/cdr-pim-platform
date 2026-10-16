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
    <header className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:gap-5">
      <div className="min-w-0">
        <h1 className="break-words text-[26px] font-semibold leading-tight tracking-[-0.035em] text-cdr-ink">
          {title}
        </h1>
        <p className="mt-0.5 max-w-4xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">{actions}</div>
      ) : null}
    </header>
  );
}
