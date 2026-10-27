'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  PanelLeftClose,
  ChevronUp,
  UsersRound,
  PackageSearch,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { ColumnOrderUserProvider } from '@/components/column-order';
import { resetColumnPreferences, TableColumnResizeController } from '@/components/column-resize';
import { TableActionTooltip } from '@/components/table-action-tooltip';
import { Button } from '@/components/ui/button';
import type { AuthActor } from '@/lib/auth';
import { logoutSession } from '@/lib/bff-client';
import { cn } from '@/lib/utils';

interface NavigationItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  capability: AuthCapability;
}

const pageSequence = [
  { reference: 4, href: '/', label: 'Dashboard', capability: 'menu:home:view' },
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
      ['Dashboard', '/', 'menu:home:view'],
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

const SIDEBAR_PREFERENCE_KEY = 'cdr:pim:sidebar';

function Sidebar({
  open,
  collapsed,
  onClose,
  onToggle,
  labelledBy,
  actor,
  onOpenIndex,
  onOpenStates,
  onLogout,
  loggingOut,
  logoutError,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
  labelledBy: string;
  actor: AuthActor;
  onOpenIndex: () => void;
  onOpenStates: () => void;
  onLogout: () => void;
  loggingOut: boolean;
  logoutError: string | null;
}) {
  const pathname = usePathname();
  const homeHref =
    navigation.find((item) => actor.capabilities.includes(item.capability))?.href ??
    '#main-content';
  const searchHref = actor.capabilities.includes('menu:ai-quality:view')
    ? '/quality?view=search'
    : actor.capabilities.includes('menu:products:view')
      ? '/products'
      : null;
  const closeButton = useRef<HTMLButtonElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const accountPanel = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountId = useId();
  const roleLabel = actor.roles.length > 0 ? actor.roles.join(' · ') : 'Sin rol asignado';

  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (open && !desktop) closeButton.current?.focus();
  }, [open, desktop]);

  useEffect(() => {
    if (!open || desktop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (accountOpen) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        const first = elements?.[0];
        const last = elements?.[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open, desktop, accountOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    accountPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (
        !accountPanel.current?.contains(event.target as Node) &&
        !accountButton.current?.contains(event.target as Node)
      ) {
        setAccountOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setAccountOpen(false);
        accountButton.current?.focus();
      }
      if (event.key === 'Tab') {
        const items =
          accountPanel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
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
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

  const openTool = (action: () => void) => {
    setAccountOpen(false);
    onClose();
    action();
  };

  return (
    <>
      {open && !desktop ? (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          className="fixed inset-0 z-40 bg-black/45"
          onClick={onClose}
          tabIndex={-1}
        />
      ) : null}
      <aside
        ref={sidebar}
        id={labelledBy}
        aria-label="Navegación principal"
        aria-hidden={!open && !desktop}
        inert={!open && !desktop}
        className={cn('cdr-sidebar', open && 'is-open')}
      >
        <div className="cdr-side-head">
          <Link
            href={homeHref}
            onClick={onClose}
            aria-label="CDR PIM, ir al inicio"
            className="cdr-side-logo"
          >
            <Image
              src="/brand/cdr-logo.png"
              alt="Casa del Rulimán"
              width={520}
              height={158}
              priority
              className="cdr-logo-full"
            />
            <Image
              src="/brand/cdr-isotipo-white.png"
              alt=""
              width={188}
              height={188}
              className="cdr-logo-mark"
            />
          </Link>
          <button
            type="button"
            className="cdr-side-toggle"
            onClick={onToggle}
            aria-label={collapsed ? 'Expandir menú principal' : 'Contraer menú principal'}
            aria-expanded={!collapsed}
            aria-controls={labelledBy}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            <PanelLeftClose
              aria-hidden="true"
              className={cn('size-4', collapsed && 'rotate-180')}
            />
          </button>
          <button
            ref={closeButton}
            type="button"
            className="cdr-side-close"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {searchHref ? (
          <Link
            href={searchHref}
            onClick={onClose}
            className="cdr-side-search"
            aria-label="Abrir la búsqueda del PIM"
            title="Buscar en PIM"
          >
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span>Buscar en PIM…</span>
          </Link>
        ) : null}
        <nav aria-label="Módulos del PIM" className="cdr-side-nav">
          {navigation
            .filter((item) => actor.capabilities.includes(item.capability))
            .map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : Boolean(item.href && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.label}
                  href={item.href ?? homeHref}
                  onClick={onClose}
                  aria-label={item.label}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={cn('cdr-nav-link', active && 'is-active')}
                >
                  <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>
        <div className="cdr-side-foot">
          <button
            ref={accountButton}
            type="button"
            className="cdr-side-account"
            onClick={() => setAccountOpen((value) => !value)}
            aria-expanded={accountOpen}
            aria-controls={accountId}
            aria-label={`Cuenta de ${actorName(actor.email)}`}
            title={`${actor.email} · ${roleLabel}`}
          >
            <span className="cdr-account-avatar" aria-hidden="true">
              {actorInitials(actor.email)}
            </span>
            <span className="cdr-account-text">
              <strong>{actorName(actor.email)}</strong>
              <small>{roleLabel}</small>
            </span>
            <ChevronUp aria-hidden="true" className="cdr-account-caret size-3.5" />
          </button>
        </div>
      </aside>
      {accountOpen ? (
        <div
          ref={accountPanel}
          id={accountId}
          className="cdr-account-panel"
          role="region"
          aria-label="Cuenta"
        >
          <div className="flex items-center gap-2.5 border-b p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cdr-ink text-xs text-white">
              {actorInitials(actor.email)}
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-sm">{actorName(actor.email)}</strong>
              <small className="block truncate text-xs text-muted-foreground">{actor.email}</small>
            </div>
          </div>
          <div className="border-b px-3 py-2.5 text-xs">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Perfil
            </span>
            <strong className="mt-1 block font-medium">{roleLabel}</strong>
          </div>
          <button
            type="button"
            className="cdr-account-action"
            onClick={() => openTool(onOpenIndex)}
          >
            <LayoutGrid aria-hidden="true" className="size-4" />
            Pantallas
          </button>
          <button
            type="button"
            className="cdr-account-action"
            onClick={() => openTool(onOpenStates)}
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            Estados UX
          </button>
          {logoutError ? (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {logoutError}
            </p>
          ) : null}
          <button
            type="button"
            className="cdr-account-action"
            onClick={() => {
              resetColumnPreferences(actor.id);
              setAccountOpen(false);
            }}
          >
            <Ruler aria-hidden="true" className="size-4" />
            Restablecer columnas de las tablas
          </button>
          <button
            type="button"
            className="cdr-account-action border-t"
            onClick={onLogout}
            disabled={loggingOut}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      ) : null}
    </>
  );
}

function actorInitials(email: string): string {
  const segments = (email.split('@')[0] ?? '').split(/[._-]+/u).filter(Boolean);
  return (
    segments
      .slice(0, 2)
      .map((segment) => segment.charAt(0))
      .join('') || 'US'
  ).toUpperCase();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [screenIndexOpen, setScreenIndexOpen] = useState(false);
  const [screenIndexMode, setScreenIndexMode] = useState<'map' | 'states'>('map');
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const navigationId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const screen = pageSequence.find(
    (item) => item.reference === referencePage(pathname, searchParams.get('view')),
  );

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === 'collapsed');
    } catch {
      // Preferences are optional; navigation remains available without browser storage.
    }
  }, []);

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

  const closeMenu = () => {
    setMenuOpen(false);
    if (window.matchMedia('(max-width: 720px)').matches)
      requestAnimationFrame(() => menuButton.current?.focus());
  };

  const toggleNavigation = () => {
    setSidebarCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* Optional UI preference. */
      }
      return next;
    });
  };

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
          <Sidebar
            open={menuOpen}
            collapsed={sidebarCollapsed}
            onClose={closeMenu}
            onToggle={toggleNavigation}
            labelledBy={navigationId}
            actor={actor}
            onOpenIndex={() => openScreenIndex('map')}
            onOpenStates={() => openScreenIndex('states')}
            onLogout={() => void handleLogout()}
            loggingOut={loggingOut}
            logoutError={logoutError}
          />
          <div className="min-w-0 max-w-full flex-1">
            <header className="cdr-mobile-bar">
              <button
                ref={menuButton}
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-white/10"
                onClick={() => setMenuOpen(true)}
                aria-expanded={menuOpen}
                aria-controls={navigationId}
                aria-label="Abrir menú principal"
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
              <Image src="/brand/cdr-isotipo-white.png" alt="" width={24} height={24} />
              <span className="truncate">{screen?.label ?? 'CDR PIM'}</span>
            </header>
            <main
              id="main-content"
              tabIndex={-1}
              className="cdr-main min-h-dvh min-w-0 max-w-full bg-white px-3 pb-16 pt-5 outline-none min-[721px]:px-6 min-[1051px]:px-[35px] min-[1051px]:pt-6"
            >
              {!pathname.startsWith('/products/') ? (
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
              {children}
            </main>
            <FooterPager
              collapsed={sidebarCollapsed}
              capabilities={actor.capabilities}
              onOpenIndex={() => openScreenIndex('map')}
              onOpenStates={() => openScreenIndex('states')}
            />
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
