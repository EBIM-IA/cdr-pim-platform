'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Boxes,
  FileText,
  FileUp,
  FolderTree,
  Gauge,
  Home,
  Link2,
  Menu,
  PackageCheck,
  PackageSearch,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavigationItem {
  label: string;
  href?: string;
  icon: LucideIcon;
}

const navigation: NavigationItem[] = [
  { label: 'Inicio', href: '/', icon: Home },
  { label: 'Productos', href: '/products', icon: PackageSearch },
  { label: 'Categorías', href: '/categories', icon: FolderTree },
  { label: 'Plantillas', href: '/templates', icon: Boxes },
  { label: 'Aplicaciones', href: '/applications', icon: PackageCheck },
  { label: 'Equivalencias', href: '/equivalences', icon: Link2 },
  { label: 'Documentos', href: '/documents', icon: FileText },
  { label: 'Importaciones', href: '/imports', icon: FileUp },
  { label: 'IA y Calidad', href: '/quality', icon: Sparkles },
  { label: 'Publicación', href: '/publication', icon: Gauge },
  { label: 'Integraciones', href: '/integrations', icon: ShieldCheck },
  { label: 'Reportes', href: '/reports', icon: BarChart3 },
  { label: 'Administración', href: '/administration', icon: Users },
];

function Sidebar({
  open,
  onClose,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
}) {
  const pathname = usePathname();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar menú de navegación"
        className={cn(
          'fixed inset-0 z-40 bg-black/45 transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />
      <aside
        id={labelledBy}
        aria-label="Navegación principal"
        aria-hidden={!open && !desktop}
        inert={!open && !desktop}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,260px)] flex-col overflow-y-auto bg-cdr-orange px-3 pb-5 pt-4 text-white shadow-sidebar transition-transform lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:w-[236px] lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-3 flex min-h-20 items-center justify-between px-3 lg:justify-center">
          <Link href="/" onClick={onClose} aria-label="CDR PIM, ir al inicio">
            <Image
              src="/brand/cdr-isotipo.svg"
              alt="Casa del Rulimán"
              width={96}
              height={84}
              priority
              className="h-auto w-[88px]"
            />
          </Link>
          <Button
            ref={closeButton}
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15 hover:text-white lg:hidden"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Módulos del PIM">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/'
                ? pathname === '/'
                : Boolean(item.href && pathname.startsWith(item.href));
            const content = (
              <>
                <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                <span>{item.label}</span>
                {!item.href ? (
                  <span className="ml-auto text-[9px] uppercase tracking-wide">Próximo</span>
                ) : null}
              </>
            );
            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                  active ? 'bg-white/25 ring-1 ring-inset ring-white/25' : 'hover:bg-white/15',
                )}
              >
                {content}
              </Link>
            ) : (
              <span
                key={item.label}
                aria-disabled="true"
                className="flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-semibold text-white/55"
              >
                {content}
              </span>
            );
          })}
        </nav>

        <div className="mt-5 border-t border-white/20 px-4 pt-4 text-[11px] leading-relaxed text-white/75">
          <div className="mb-1 flex items-center gap-2 font-semibold text-white">
            <Settings aria-hidden="true" className="size-3.5" />
            CDR PIM
          </div>
          Catálogo maestro de productos
        </div>
      </aside>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };

  return (
    <div className="min-h-dvh bg-slate-100">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-cdr-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar al contenido
      </a>
      <div className="mx-auto flex min-h-dvh max-w-[1920px] bg-white shadow-sm">
        <Sidebar open={menuOpen} onClose={closeMenu} labelledBy={navigationId} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-2 border-b border-border bg-white/95 px-3 backdrop-blur sm:px-5 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Button
                ref={menuButton}
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => setMenuOpen(true)}
                aria-expanded={menuOpen}
                aria-controls={navigationId}
                aria-label="Abrir menú principal"
              >
                <Menu className="size-5" />
              </Button>
              <span className="inline-flex h-10 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-white sm:px-4 sm:text-sm">
                PIM <span className="hidden sm:inline">· Operación</span>
              </span>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
              <Button
                asChild
                variant="secondary"
                className="max-w-[180px] px-3 sm:w-[240px] sm:justify-start"
              >
                <Link href="/products" aria-label="Abrir el catálogo para buscar productos">
                  <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="hidden truncate text-muted-foreground sm:inline">
                    Buscar productos…
                  </span>
                </Link>
              </Button>
              <div className="hidden text-right leading-tight md:block">
                <strong className="block text-sm">Usuario demo</strong>
                <span className="text-xs text-muted-foreground">Entorno local</span>
              </div>
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full bg-cdr-ink text-xs font-semibold text-white"
                aria-label="Perfil: Usuario demo"
              >
                UD
              </span>
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-[calc(100dvh-72px)] bg-white px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-9"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
