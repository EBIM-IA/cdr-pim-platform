'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StickyProductNavigation({
  anchorId,
  title,
  subtitle,
  thumbnail,
  children,
}: {
  anchorId: string;
  title: string;
  subtitle: string;
  thumbnail?: ReactNode;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setVisible(Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.bottom < 6)),
      { rootMargin: '-6px 0px 0px 0px' },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorId]);
  return (
    <nav
      aria-label="Contexto persistente del producto"
      className={cn('cdr-sticky-product', visible && 'is-visible')}
      aria-hidden={!visible}
      inert={!visible}
    >
      <a href={`#${anchorId}`} className="min-w-0 shrink">
        {thumbnail ? <span className="cdr-sticky-thumbnail">{thumbnail}</span> : null}
        <span className="cdr-sticky-identity">
          <strong className="block truncate">{title}</strong>
          <small className="block truncate text-muted-foreground">{subtitle}</small>
        </span>
      </a>
      <div className="flex min-w-0 gap-1 overflow-x-auto">{children}</div>
    </nav>
  );
}
