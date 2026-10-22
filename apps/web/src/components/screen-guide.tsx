'use client';

import { ChevronDown, CircleHelp } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const guideId = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const [helpTarget, setHelpTarget] = useState<Element | null>(null);

  useEffect(() => {
    setHelpTarget(anchor.current?.closest('main')?.querySelector('[data-page-help-slot]') ?? null);
  }, [pathname]);
  const storageKey = `cdr:screen-guide:${pathname}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setOpen(stored === 'open');
    } catch {
      // Storage may be disabled; the guide remains available for the current render.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!details.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        details.current?.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const guide = (
    <details
      ref={details}
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
      className={
        helpTarget
          ? 'group text-xs text-slate-700'
          : 'group relative mb-3 w-fit max-w-full text-xs text-slate-700'
      }
    >
      <summary className="flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-muted-foreground marker:content-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <CircleHelp aria-hidden="true" className="size-3.5 shrink-0" />
        <span className={helpTarget ? 'sr-only' : undefined}>¿Qué es esta pantalla?</span>
        {!helpTarget ? (
          <ChevronDown
            aria-hidden="true"
            className="size-3 transition-transform group-open:rotate-180"
          />
        ) : null}
      </summary>

      <div
        className={`${helpTarget ? 'absolute left-0 top-full z-40' : 'relative z-10'} mt-2 grid w-[min(720px,calc(100vw-40px))] max-w-full gap-4 rounded-xl border bg-white p-4 shadow-lg sm:grid-cols-2`}
      >
        <p className="leading-relaxed text-muted-foreground sm:col-span-2">{objective}</p>
        <section aria-labelledby={`${guideId}-actions`}>
          <h2
            id={`${guideId}-actions`}
            className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-foreground"
          >
            {actionsLabel}
          </h2>
          <ul className="list-disc space-y-1.5 pl-4 leading-relaxed">
            {actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${guideId}-data`}>
          <h2
            id={`${guideId}-data`}
            className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-foreground"
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

  return (
    <>
      <span ref={anchor} className="contents" />
      {helpTarget ? createPortal(guide, helpTarget) : guide}
    </>
  );
}
