'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ACTION_SELECTOR = 'table tbody a[href], table tbody button:not(:disabled)';

function actionLabel(action: HTMLElement): string {
  const supplied =
    action.getAttribute('data-tip') ||
    action.getAttribute('title') ||
    action.getAttribute('aria-label');
  if (supplied) return supplied;
  const text = action.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
  if (!text || text.length > 100) return '';
  const href = action.getAttribute('href') ?? '';
  if (/^\/products\//u.test(href)) return `Ver ficha de ${text}`;
  if (/^\/equivalences(?:\?|$)/u.test(href)) return `Abrir código unificador ${text}`;
  if (/^\/templates(?:\?|$)/u.test(href)) return `Ver plantilla ${text}`;
  if (/^\/categories(?:\?|$)/u.test(href)) return `Ver categoría ${text}`;
  return text;
}

/** A single delegated tooltip covers dynamically loaded table actions. */
export function TableActionTooltip({ scopeKey }: { readonly scopeKey: string }) {
  const id = useId();
  const tip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ action: HTMLElement; label: string } | null>(null);

  useEffect(() => {
    const root = document.querySelector('.cdr-app');
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let previousDescription: string | null = null;
    let previousTitle: string | null = null;
    const hide = () => {
      clearTimeout(timer);
      if (current) {
        if (previousDescription === null) current.removeAttribute('aria-describedby');
        else current.setAttribute('aria-describedby', previousDescription);
        if (previousTitle !== null) current.setAttribute('title', previousTitle);
      }
      current = null;
      setActive(null);
    };
    const activate = (action: HTMLElement, delay: number) => {
      if (current === action) return;
      hide();
      const label = actionLabel(action);
      if (!label) return;
      current = action;
      previousDescription = action.getAttribute('aria-describedby');
      previousTitle = action.getAttribute('title');
      // Use the same text immediately, without a second delayed native tooltip.
      action.removeAttribute('title');
      timer = setTimeout(() => {
        if (!action.isConnected) return hide();
        action.setAttribute(
          'aria-describedby',
          [previousDescription, id].filter(Boolean).join(' '),
        );
        setActive({ action, label });
      }, delay);
    };
    const over = (event: Event) => {
      const target =
        event.target instanceof Element ? event.target.closest<HTMLElement>(ACTION_SELECTOR) : null;
      if (target) activate(target, event.type === 'focusin' ? 0 : 250);
    };
    const out = (event: Event) => {
      const related = (event as MouseEvent | FocusEvent).relatedTarget;
      if (related instanceof Node && current?.contains(related)) return;
      if (event.type === 'pointerout' && current?.contains(document.activeElement)) return;
      hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    root.addEventListener('focusin', over);
    root.addEventListener('focusout', out);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', hide, true);
    const observer = new MutationObserver(() => {
      if (current && !root.contains(current)) hide();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerout', out);
      root.removeEventListener('focusin', over);
      root.removeEventListener('focusout', out);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', hide);
      document.removeEventListener('scroll', hide, true);
      hide();
    };
  }, [id, scopeKey]);

  useEffect(() => {
    if (!active || !tip.current) return;
    const rect = active.action.getBoundingClientRect();
    const box = tip.current.getBoundingClientRect();
    tip.current.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))}px`;
    tip.current.style.top = `${rect.top >= box.height + 8 ? rect.top - box.height - 6 : rect.bottom + 6}px`;
  }, [active]);

  return active && typeof document !== 'undefined'
    ? createPortal(
        <div ref={tip} id={id} role="tooltip" className="cdr-table-tooltip">
          {active.label}
        </div>,
        document.body,
      )
    : null;
}
