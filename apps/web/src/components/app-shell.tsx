'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthCapability } from '@cdr/contracts';
import {
  BarChart3,
  BookText,
  FileText,
  FileUp,
  FolderTree,
  Gauge,
  Home,
  ArrowRightLeft,
  LayoutGrid,
  LogOut,
  Menu,
  ChevronDown,
  UsersRound,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { ColumnOrderUserProvider } from '@/components/column-order';
import { resetColumnPreferences, TableColumnResizeController } from '@/components/column-resize';
import { TableExportPermission } from '@/components/table-export-buttons';
import { TableActionTooltip } from '@/components/table-action-tooltip';
import { Button } from '@/components/ui/button';
import type { AuthActor } from '@/lib/auth';
import { logoutSession } from '@/lib/bff-client';
import { isAdministrator } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface NavigationItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  capability: AuthCapability;
}

const pageSequence = [
  { reference: 4, href: '/', label: 'Inicio', capability: 'menu:home:view' },
  { reference: 5, href: '/products', label: 'Productos', capability: 'menu:products:view' },
  {
    reference: 6,
    href: '/products',
    label: 'Detalle de Producto',
    capability: 'menu:products:view',
  },
  {
    reference: 7,
    href: '/products',
    label: 'Editar Enriquecimiento',
    capability: 'menu:products:view',
  },
  {
    reference: 8,
    href: '/categories',
    label: 'Categorías y Líneas',
    capability: 'menu:categories:view',
  },
  {
    reference: 9,
    href: '/templates',
    label: 'Plantilla Dinámica',
    capability: 'menu:templates:view',
  },
  {
    reference: 10,
    href: '/applications',
    label: 'Aplicaciones',
    capability: 'menu:applications:view',
  },
  {
    reference: 11,
    href: '/equivalences',
    label: 'Código Unificador y Homólogos',
    capability: 'menu:equivalences:view',
  },
  {
    reference: 12,
    href: '/equivalences?view=identifiers',
    label: 'Identificadores y Homólogos',
    capability: 'menu:equivalences:view',
  },
  {
    reference: 13,
    href: '/documents',
    label: 'Imágenes y Documentos',
    capability: 'menu:documents:view',
  },
  { reference: 14, href: '/imports', label: 'Importaciones', capability: 'menu:imports:view' },
  {
    reference: 15,
    href: '/imports?view=new',
    label: 'Nueva Importación',
    capability: 'menu:imports:view',
  },
  {
    reference: 16,
    href: '/imports?view=result',
    label: 'Resultado de Importación',
    capability: 'menu:imports:view',
  },
  {
    reference: 17,
    href: '/quality?view=search',
    label: 'Búsqueda Inteligente',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 18,
    href: '/quality?view=extraction',
    label: 'Revisión de Extracción IA',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 19,
    href: '/quality?view=commercial',
    label: 'Descripción Comercial con IA',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 20,
    href: '/quality?view=quality',
    label: 'Calidad del Catálogo',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 21,
    href: '/quality?view=duplicates',
    label: 'Posibles Duplicados',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 22,
    href: '/quality?view=review',
    label: 'Bandeja de Revisión y Aprobación',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 23,
    href: '/quality?view=sources',
    label: 'Prioridad de Fuentes',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 24,
    href: '/quality?view=conflict',
    label: 'Resolver Conflicto de Fuentes',
    capability: 'menu:ai-quality:view',
  },
  {
    reference: 25,
    href: '/publication?view=channels',
    label: 'Publicación por Canal',
    capability: 'menu:publication:view',
  },
  {
    reference: 26,
    href: '/publication?view=prestashop',
    label: 'Canal PrestaShop',
    capability: 'menu:publication:view',
  },
  {
    reference: 27,
    href: '/publication?view=images',
    label: 'Migración de Imágenes PrestaShop',
    capability: 'menu:publication:view',
  },
  {
    reference: 28,
    href: '/integrations?view=sources',
    label: 'Fuentes Externas',
    capability: 'menu:integrations:view',
  },
  {
    reference: 29,
    href: '/integrations?view=monitor',
    label: 'Monitor de Integraciones',
    capability: 'menu:integrations:view',
  },
  {
    reference: 30,
    href: '/integrations?view=batches',
    label: 'Detalle de Lote Sismetic / AX',
    capability: 'menu:integrations:view',
  },
  {
    reference: 31,
    href: '/administration?view=users',
    label: 'Usuarios',
    capability: 'menu:administration:view',
  },
  {
    reference: 32,
    href: '/administration?view=roles',
    label: 'Roles y Permisos',
    capability: 'menu:administration:view',
  },
  {
    reference: 33,
    href: '/administration?view=audit',
    label: 'Auditoría y Trazabilidad',
    capability: 'menu:administration:view',
  },
  {
    reference: 34,
    href: '/reports?view=reports',
    label: 'Reportes',
    capability: 'menu:reports:view',
  },
  {
    reference: 35,
    href: '/reports?view=searches',
    label: 'Reporte de Búsquedas',
    capability: 'menu:reports:view',
  },
  {
    reference: 36,
    href: '/administration?view=settings',
    label: 'Catálogos de Configuración',
    capability: 'menu:administration:view',
  },
  {
    reference: 37,
    href: '/catalogs',
    label: 'Catálogos de productos',
    capability: 'menu:catalogs:view',
  },
] as const satisfies readonly {
  reference: number;
  href: string;
  label: string;
  capability: AuthCapability;
}[];

const AUTHENTICATED_SCREEN_COUNT = pageSequence.length;
const TOTAL_SCREEN_COUNT = AUTHENTICATED_SCREEN_COUNT + 1;

const navigation: NavigationItem[] = [
  { label: 'Inicio', href: '/', icon: Home, capability: 'menu:home:view' },
  {
    label: 'Productos',
    href: '/products',
    icon: PackageSearch,
    capability: 'menu:products:view',
  },
  {
    label: 'Categorías',
    href: '/categories',
    icon: FolderTree,
    capability: 'menu:categories:view',
  },
  { label: 'Plantillas', href: '/templates', icon: BookText, capability: 'menu:templates:view' },
  {
    label: 'Aplicaciones',
    href: '/applications',
    icon: UsersRound,
    capability: 'menu:applications:view',
  },
  {
    label: 'Código Unificador y Homólogos',
    href: '/equivalences',
    icon: ArrowRightLeft,
    capability: 'menu:equivalences:view',
  },
  {
    label: 'Documentos',
    href: '/documents',
    icon: FileText,
    capability: 'menu:documents:view',
  },
  {
    label: 'Catálogos',
    href: '/catalogs',
    icon: BookText,
    capability: 'menu:catalogs:view',
  },
  {
    label: 'Importaciones',
    href: '/imports',
    icon: FileUp,
    capability: 'menu:imports:view',
  },
  {
    label: 'IA y Calidad',
    href: '/quality',
    icon: Sparkles,
    capability: 'menu:ai-quality:view',
  },
  {
    label: 'Publicación',
    href: '/publication',
    icon: Gauge,
    capability: 'menu:publication:view',
  },
  {
    label: 'Integraciones',
    href: '/integrations',
    icon: ShieldCheck,
    capability: 'menu:integrations:view',
  },
  { label: 'Reportes', href: '/reports', icon: BarChart3, capability: 'menu:reports:view' },
  {
    label: 'Administración',
    href: '/administration',
    icon: Users,
    capability: 'menu:administration:view',
  },
];

const screenIndex = [
  {
    label: 'Catálogo',
    links: [
      ['Inicio', '/', 'menu:home:view'],
      ['Productos', '/products', 'menu:products:view'],
      ['Detalle de Producto', '/products', 'menu:products:view'],
      ['Editar Enriquecimiento', '/products', 'menu:products:view'],
      ['Categorías y Líneas', '/categories', 'menu:categories:view'],
      ['Plantilla Dinámica', '/templates', 'menu:templates:view'],
      ['Aplicaciones', '/applications', 'menu:applications:view'],
      ['Código Unificador y Homólogos', '/equivalences', 'menu:equivalences:view'],
      ['Identificadores y Homólogos', '/equivalences?view=identifiers', 'menu:equivalences:view'],
      ['Imágenes y Documentos', '/documents', 'menu:documents:view'],
      ['Catálogos de productos', '/catalogs', 'menu:catalogs:view'],
    ],
  },
  {
    label: 'IA y calidad',
    links: [
      ['Búsqueda Inteligente', '/quality?view=search', 'menu:ai-quality:view'],
      ['Extracción IA', '/quality?view=extraction', 'menu:ai-quality:view'],
      ['Descripción Comercial', '/quality?view=commercial', 'menu:ai-quality:view'],
      ['Calidad del Catálogo', '/quality?view=quality', 'menu:ai-quality:view'],
      ['Posibles Duplicados', '/quality?view=duplicates', 'menu:ai-quality:view'],
      ['Bandeja de Revisión', '/quality?view=review', 'menu:ai-quality:view'],
      ['Prioridad de Fuentes', '/quality?view=sources', 'menu:ai-quality:view'],
      ['Resolver Conflicto', '/quality?view=conflict', 'menu:ai-quality:view'],
    ],
  },
  {
    label: 'Operación y gobierno',
    links: [
      ['Importaciones', '/imports', 'menu:imports:view'],
      ['Nueva Importación', '/imports?view=new', 'menu:imports:view'],
      ['Resultado de Importación', '/imports?view=result', 'menu:imports:view'],
      ['Publicación por Canal', '/publication?view=channels', 'menu:publication:view'],
      ['Canal PrestaShop', '/publication?view=prestashop', 'menu:publication:view'],
      ['Migración de Imágenes', '/publication?view=images', 'menu:publication:view'],
      ['Fuentes Externas', '/integrations?view=sources', 'menu:integrations:view'],
      ['Monitor de Integraciones', '/integrations?view=monitor', 'menu:integrations:view'],
      ['Lotes Sismetic / AX', '/integrations?view=batches', 'menu:integrations:view'],
      ['Usuarios', '/administration?view=users', 'menu:administration:view'],
      ['Roles y Permisos', '/administration?view=roles', 'menu:administration:view'],
      ['Auditoría', '/administration?view=audit', 'menu:administration:view'],
      ['Reportes Operativos', '/reports?view=reports', 'menu:reports:view'],
      ['Reporte de Búsquedas', '/reports?view=searches', 'menu:reports:view'],
      ['Catálogos de Configuración', '/administration?view=settings', 'menu:administration:view'],
    ],
  },
] as const;

const uxStates = [
  ['Carga', 'Esqueleto o progreso mientras el backend responde.'],
  ['Vacío', 'Explica por qué no hay registros y ofrece una acción segura.'],
  ['Sin resultados', 'Conserva los filtros y permite limpiarlos.'],
  ['Error recuperable', 'Describe el fallo y habilita reintento.'],
  ['Sin permisos', 'Bloquea la acción en UI; el backend vuelve a autorizar.'],
  ['Procesando', 'Evita dobles envíos y comunica actividad.'],
  ['Éxito', 'Confirma el cambio persistido y su alcance.'],
  ['Conflicto', 'Advierte sobre concurrencia o fuentes antes de sobrescribir.'],
] as const;

function TopNavigation({
  actor,
  onOpenIndex,
  onOpenStates,
  onLogout,
  loggingOut,
  logoutError,
}: {
  actor: AuthActor;
  onOpenIndex: () => void;
  onOpenStates: () => void;
  onLogout: () => void;
  loggingOut: boolean;
  logoutError: string | null;
}) {
  const pathname = usePathname();
  const admin = isAdministrator(actor.roles);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [limit, setLimit] = useState(5);
  const root = useRef<HTMLElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = useMemo(
    () =>
      navigation.filter(
        (item) =>
          actor.capabilities.includes(item.capability) &&
          (admin || item.href === '/products' || item.href === '/catalogs'),
      ),
    [actor.capabilities, admin],
  );
  const active = (item: NavigationItem) =>
    item.href === '/' ? pathname === '/' : !!item.href && pathname.startsWith(item.href);
  const primary = items.slice(0, limit);
  const current = items.find(active);
  if (current && !primary.includes(current) && primary.length)
    primary[primary.length - 1] = current;
  const overflow = items.filter((item) => !primary.includes(item));
  useEffect(() => {
    const nav = root.current?.querySelector<HTMLElement>('.cdr-top-nav');
    const measure = root.current?.querySelector<HTMLElement>('[data-nav-measure]');
    if (!nav || !measure) return;
    const resize = () => {
      if (window.innerWidth <= 720 || nav.clientWidth === 0) return;
      const widths = [...measure.children].map(
        (element) => element.getBoundingClientRect().width + 2,
      );
      const more = widths.pop() ?? 0;
      if (widths.reduce((sum, width) => sum + width, 0) - 2 <= nav.clientWidth) {
        setLimit(items.length);
        return;
      }
      const activeIndex = items.findIndex((item) =>
        item.href === '/' ? pathname === '/' : !!item.href && pathname.startsWith(item.href),
      );
      let available = nav.clientWidth - more - (widths[activeIndex] ?? 0);
      let count = activeIndex >= 0 ? 1 : 0;
      for (let index = 0; index < items.length; index += 1) {
        if (index === activeIndex) continue;
        const width = widths[index] ?? 0;
        if (width > available) break;
        available -= width;
        count += 1;
      }
      setLimit(Math.max(1, count));
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(nav);
    observer?.observe(measure);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [items, pathname]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setAccountOpen(false);
        setMoreOpen(false);
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (accountOpen || moreOpen || open)) {
        setAccountOpen(false);
        setMoreOpen(false);
        setOpen(false);
        accountTrigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [accountOpen, moreOpen, open]);
  const link = (item: NavigationItem) => (
    <Link
      key={item.label}
      href={item.href ?? '/'}
      aria-current={active(item) ? 'page' : undefined}
      className={cn('cdr-top-link', active(item) && 'is-active')}
      onClick={() => {
        setOpen(false);
        setMoreOpen(false);
      }}
    >
      {item.label}
    </Link>
  );
  return (
    <header ref={root} className="cdr-topbar">
      <div className="cdr-top-measure" data-nav-measure aria-hidden inert>
        {items.map((item) => (
          <span key={item.href} className={cn('cdr-top-link', active(item) && 'is-active')}>
            {item.label}
          </span>
        ))}
        <span className="cdr-top-link">
          Más <ChevronDown className="size-3" />
        </span>
      </div>
      <button
        type="button"
        className="cdr-top-burger"
        aria-label={open ? 'Cerrar menú principal' : 'Abrir menú principal'}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <Menu className="size-5" />
      </button>
      <Link
        href={
          actor.capabilities.includes('menu:products:view') ||
          actor.capabilities.includes('menu:home:view')
            ? '/'
            : (items[0]?.href ?? '#main-content')
        }
        className="cdr-top-logo"
        aria-label="CDR PIM, ir al inicio"
      >
        <Image
          src="/brand/cdr-isotipo-white.png"
          width={38}
          height={38}
          alt="Casa del Rulimán"
          priority
        />
      </Link>
      <nav
        id={menuId}
        aria-label="Módulos del PIM"
        className={cn('cdr-top-nav', open && 'is-open')}
      >
        <div className="cdr-top-desktop">
          {primary.map(link)}
          {overflow.length ? (
            <div className="cdr-top-more">
              <button
                type="button"
                className="cdr-top-link"
                aria-expanded={moreOpen}
                onClick={() => {
                  setMoreOpen(!moreOpen);
                  setAccountOpen(false);
                }}
              >
                Más <ChevronDown className="size-3" />
              </button>
              {moreOpen ? <div className="cdr-top-dropdown">{overflow.map(link)}</div> : null}
            </div>
          ) : null}
        </div>
        <div className="cdr-top-mobile" hidden={!open}>
          {items.map(link)}
        </div>
      </nav>
      <div className="cdr-top-account">
        <button
          ref={accountTrigger}
          type="button"
          className="cdr-top-user"
          aria-label={`Cuenta de ${actorName(actor.email)}`}
          aria-expanded={accountOpen}
          onClick={() => {
            setAccountOpen(!accountOpen);
            setMoreOpen(false);
          }}
        >
          <span className="cdr-top-username">{actorName(actor.email)} · </span>
          <strong>
            {admin
              ? 'Administrador'
              : actor.roles
                  .map((role) =>
                    role === 'VENTAS' ? 'Ventas' : role === 'COMPRAS' ? 'Compras' : role,
                  )
                  .join(' · ')}
          </strong>
          <ChevronDown className="size-3" />
        </button>
        {accountOpen ? (
          <div role="region" aria-label="Cuenta" className="cdr-top-dropdown cdr-top-account-panel">
            <p className="border-b p-3 text-xs text-muted-foreground">{actor.email}</p>
            {admin ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    onOpenIndex();
                  }}
                >
                  Índice de pantallas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    onOpenStates();
                  }}
                >
                  Estados UX
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                resetColumnPreferences(actor.id);
                setAccountOpen(false);
              }}
            >
              Restablecer columnas de las tablas
            </button>
            <button type="button" onClick={onLogout} disabled={loggingOut}>
              <LogOut className="size-4" />
              {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
            {logoutError ? (
              <p role="alert" className="p-3 text-xs text-destructive">
                {logoutError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function actorName(email: string): string {
  const value = email.split('@')[0] ?? email;
  return value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function referencePage(pathname: string, view: string | null): number {
  if (pathname === '/') return 4;
  if (pathname === '/products') return 5;
  if (pathname.startsWith('/products/')) return view === 'enrichment' ? 7 : 6;
  if (pathname.startsWith('/categories')) return 8;
  if (pathname.startsWith('/templates')) return 9;
  if (pathname.startsWith('/applications')) return 10;
  if (pathname.startsWith('/equivalences')) return view === 'identifiers' ? 12 : 11;
  if (pathname.startsWith('/documents')) return 13;
  if (pathname.startsWith('/catalogs')) return 37;
  if (pathname.startsWith('/imports')) return view === 'new' ? 15 : view === 'result' ? 16 : 14;
  if (pathname.startsWith('/quality')) {
    return (
      {
        search: 17,
        extraction: 18,
        commercial: 19,
        quality: 20,
        duplicates: 21,
        review: 22,
        sources: 23,
        conflict: 24,
      }[view ?? 'quality'] ?? 20
    );
  }
  if (pathname.startsWith('/publication')) {
    return view === 'prestashop' ? 26 : view === 'images' ? 27 : 25;
  }
  if (pathname.startsWith('/integrations')) {
    return view === 'sources' ? 28 : view === 'batches' ? 30 : 29;
  }
  if (pathname.startsWith('/administration')) {
    return view === 'roles' ? 32 : view === 'audit' ? 33 : view === 'settings' ? 36 : 31;
  }
  if (pathname.startsWith('/reports')) return view === 'searches' ? 35 : 34;
  return 4;
}

function FooterPager({
  collapsed,
  capabilities,
  onOpenIndex,
  onOpenStates,
}: {
  collapsed: boolean;
  capabilities: readonly AuthCapability[];
  onOpenIndex: () => void;
  onOpenStates: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = referencePage(pathname, searchParams.get('view'));
  const current = pageSequence.find((item) => item.reference === page) ?? pageSequence[0];
  const accessibleSequence = pageSequence.filter((item) => capabilities.includes(item.capability));
  const accessibleIndex = accessibleSequence.findIndex((item) => item.reference === page);
  const previous = accessibleIndex > 0 ? accessibleSequence[accessibleIndex - 1] : null;
  const next =
    accessibleIndex >= 0 && accessibleIndex < accessibleSequence.length - 1
      ? accessibleSequence[accessibleIndex + 1]
      : null;

  return (
    <footer
      className={cn(
        'fixed bottom-0 left-0 right-0 z-30 flex h-10 items-center justify-between gap-4 border-t border-border bg-white/95 px-4 backdrop-blur transition-[left] sm:px-6 lg:px-[35px]',
        collapsed ? 'cdr-footer is-collapsed' : 'cdr-footer',
      )}
    >
      <small className="hidden truncate text-[10px] text-muted-foreground sm:block">
        Pantalla {current.reference - 2} de {TOTAL_SCREEN_COUNT} · ref. #{current.reference} ·{' '}
        {current.label}
      </small>
      <div className="ml-auto flex items-center gap-2">
        {previous ? (
          <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-[11px]">
            <Link href={previous.href}>← Anterior</Link>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px]"
          onClick={onOpenIndex}
          data-open-screen-index
        >
          Mapa · {TOTAL_SCREEN_COUNT} rutas
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden h-7 px-2.5 text-[11px] sm:inline-flex"
          onClick={onOpenStates}
        >
          Estados UX
        </Button>
        {next ? (
          <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-[11px]">
            <Link href={next.href}>Siguiente →</Link>
          </Button>
        ) : null}
      </div>
    </footer>
  );
}

export function AppShell({ children, actor }: { children: ReactNode; actor: AuthActor }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sidebarCollapsed = false;
  const [screenIndexOpen, setScreenIndexOpen] = useState(false);
  const [screenIndexMode, setScreenIndexMode] = useState<'map' | 'states'>('map');
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const screen = pageSequence.find(
    (item) => item.reference === referencePage(pathname, searchParams.get('view')),
  );

  useEffect(() => {
    if (!screenIndexOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScreenIndexOpen(false);
      if (event.key === 'Tab') {
        const items = dialog.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        const first = items?.[0];
        const last = items?.[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>('[data-open-screen-index]')?.focus();
    };
  }, [screenIndexOpen]);

  const openScreenIndex = (mode: 'map' | 'states') => {
    setScreenIndexMode(mode);
    setScreenIndexOpen(true);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logoutSession();
      window.location.replace('/login');
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : 'No fue posible cerrar la sesión. Inténtalo nuevamente.',
      );
      setLoggingOut(false);
    }
  };

  return (
    <ColumnOrderUserProvider userId={actor.id}>
      <div
        className="cdr-app min-h-dvh w-full max-w-full overflow-x-clip bg-white"
        data-collapsed={sidebarCollapsed}
      >
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-cdr-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Saltar al contenido
        </a>
        <div className="flex min-h-dvh w-full max-w-full" inert={screenIndexOpen}>
          <div className="min-w-0 max-w-full flex-1">
            <TopNavigation
              actor={actor}
              onOpenIndex={() => openScreenIndex('map')}
              onOpenStates={() => openScreenIndex('states')}
              onLogout={() => void handleLogout()}
              loggingOut={loggingOut}
              logoutError={logoutError}
            />
            <main
              id="main-content"
              tabIndex={-1}
              className="cdr-main min-h-dvh min-w-0 max-w-full bg-white px-3 pb-16 pt-5 outline-none min-[721px]:px-6 min-[1051px]:px-[35px] min-[1051px]:pt-6"
            >
              {pathname !== '/' && !pathname.startsWith('/products/') ? (
                <nav
                  aria-label="Ruta de navegación"
                  className="mb-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  {actor.capabilities.includes('menu:home:view') ? (
                    <>
                      <Link href="/" className="hover:text-foreground">
                        Inicio
                      </Link>
                      <span aria-hidden="true">›</span>
                    </>
                  ) : null}
                  <span aria-current="page">{screen?.label ?? 'CDR PIM'}</span>
                </nav>
              ) : null}
              <TableExportPermission.Provider
                value={actor.roles.some((role) => role === 'ADMINISTRADOR' || role === 'ADMIN')}
              >
                {children}
              </TableExportPermission.Provider>
            </main>
            {isAdministrator(actor.roles) ? (
              <details className="cdr-review-tools">
                <summary aria-label="Herramientas de revisión">
                  <LayoutGrid className="size-4" />
                </summary>
                <FooterPager
                  collapsed={sidebarCollapsed}
                  capabilities={actor.capabilities}
                  onOpenIndex={() => openScreenIndex('map')}
                  onOpenStates={() => openScreenIndex('states')}
                />
              </details>
            ) : null}
          </div>
        </div>
        {screenIndexOpen ? (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) setScreenIndexOpen(false);
            }}
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="screen-index-title"
              className="max-h-[85dvh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-white p-4 shadow-xl sm:p-6"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 id="screen-index-title" className="text-base font-semibold">
                    {screenIndexMode === 'map'
                      ? `Mapa de pantallas · ${TOTAL_SCREEN_COUNT} rutas`
                      : 'Estados UX compartidos'}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inicio de sesión más {AUTHENTICATED_SCREEN_COUNT} rutas autenticadas. Las
                    opciones disponibles dependen de tu perfil.
                  </p>
                </div>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted"
                  aria-label="Cerrar panel de pantallas"
                  onClick={() => setScreenIndexOpen(false)}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
              {screenIndexMode === 'map' ? (
                <div className="grid gap-5 sm:grid-cols-3">
                  {screenIndex.map((group) => (
                    <section key={group.label}>
                      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                        {group.label}
                      </h3>
                      <div className="grid gap-1">
                        {group.links
                          .filter(([, , capability]) => actor.capabilities.includes(capability))
                          .map(([label, href]) => (
                            <Link
                              key={label}
                              href={href}
                              onClick={() => setScreenIndexOpen(false)}
                              className="rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                            >
                              {label}
                            </Link>
                          ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {uxStates.map(([label, description]) => (
                    <div key={label} className="rounded-lg border p-3">
                      <strong className="text-xs">{label}</strong>
                      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <TableColumnResizeController
          userId={actor.id}
          scopeKey={`${pathname}:${searchParams.get('view') ?? ''}`}
        />
        <TableActionTooltip scopeKey={`${pathname}:${searchParams.get('view') ?? ''}`} />
      </div>
    </ColumnOrderUserProvider>
  );
}
