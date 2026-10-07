'use client';

import { ChevronDown, CircleHelp } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function ScreenGuide({
  objective,
  actions,
  actionsLabel = 'Qué puedes hacer',
  dataSource,
  limitation,
}: {
  objective: string;
  actions: readonly string[];
  actionsLabel?: string;
  dataSource: string;
  limitation?: string;
}) {
  const pathname = usePathname();
  const storageKey = `cdr:screen-guide:${pathname}`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored !== null) setOpen(stored === 'open');
    } catch {
      // Storage may be disabled; the guide remains available for the current render.
    }
  }, [storageKey]);

  return (
    <details
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        try {
          window.localStorage.setItem(storageKey, nextOpen ? 'open' : 'closed');
        } catch {
          // Persisting this optional UI preference must never block the screen.
        }
      }}
      className="group -mt-2 mb-[18px] rounded-xl border border-[#ffd1af] bg-[#fff8f2] text-xs text-slate-700"
    >
      <summary className="flex min-h-[47px] cursor-pointer list-none items-start gap-3 rounded-xl px-4 py-3 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <CircleHelp aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-primary" />
        <span className="min-w-0 flex-1 sm:flex sm:gap-2">
          <strong className="block shrink-0 text-cdr-ink">¿Qué es esta pantalla?</strong>
          <span className="mt-0.5 block leading-relaxed text-[#69727b] sm:mt-0">{objective}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
          <span className="hidden group-open:hidden sm:inline">Ver guía</span>
          <span className="hidden sm:group-open:inline">Ocultar</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="grid gap-5 px-4 pb-4 pt-0 sm:px-11 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
        <section aria-labelledby="screen-guide-actions">
          <h2
            id="screen-guide-actions"
            className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-orange-900"
          >
            {actionsLabel}
          </h2>
          <ul className="list-disc space-y-1.5 pl-4 leading-relaxed">
            {actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="screen-guide-data">
          <h2
            id="screen-guide-data"
            className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-orange-900"
          >
            De dónde salen los datos
          </h2>
          <p className="leading-relaxed">{dataSource}</p>
          {limitation ? (
            <p className="mt-2 leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-slate-700">Alcance actual:</strong> {limitation}
            </p>
          ) : null}
        </section>
      </div>
    </details>
  );
}
