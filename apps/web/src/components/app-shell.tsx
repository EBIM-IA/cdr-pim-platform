'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { AuthCapability } from '@cdr/contracts';
import {
  BarChart3,
  BookOpen,
  Boxes,
  ChevronDown,
  FileText,
  FileUp,
  FolderTree,
  Gauge,
  Home,
  Link2,
  LayoutGrid,
  LogOut,
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

import { ColumnOrderUserProvider } from '@/components/column-order';
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
    href: '/equivalences?view=homologs',
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
  { label: 'Plantillas', href: '/templates', icon: Boxes, capability: 'menu:templates:view' },
  {
    label: 'Aplicaciones',
    href: '/applications',
    icon: PackageCheck,
    capability: 'menu:applications:view',
  },
  {
    label: 'Código Unificador y Homólogos',
    href: '/equivalences',
    icon: Link2,
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
    icon: BookOpen,
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
      ['Identificadores y Homólogos', '/equivalences?view=homologs', 'menu:equivalences:view'],
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
  labelledBy,
  capabilities,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  labelledBy: string;
  capabilities: readonly AuthCapability[];
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
          'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,260px)] flex-col overflow-y-auto bg-cdr-orange px-3 pb-4 pt-3 text-white shadow-sidebar transition-[transform,width] lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:translate-x-0',
          collapsed ? 'lg:w-16 lg:px-2' : 'lg:w-[220px]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div
          className={cn(
            'mb-2 flex min-h-[94px] items-center justify-between px-3 lg:justify-center',
            collapsed && 'lg:min-h-14 lg:px-0',
          )}
        >
          <Link
            href="/"
            onClick={onClose}
            aria-label="CDR PIM, ir al inicio"
            className="flex items-center justify-center"
          >
            <Image
              src="/brand/cdr-logo-white.png"
              alt="Casa del Rulimán"
              width={520}
              height={158}
              priority
              className={cn('h-auto w-[160px]', collapsed && 'lg:hidden')}
            />
            <Image
              src="/brand/cdr-isotipo-white.png"
              alt="Casa del Rulimán"
              width={188}
              height={188}
              className={cn('hidden h-auto w-[44px]', collapsed && 'lg:block')}
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

        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Módulos del PIM">
          {navigation
            .filter((item) => capabilities.includes(item.capability))
            .map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : Boolean(item.href && pathname.startsWith(item.href));
              const content = (
                <>
                  <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                  <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
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
                    'flex min-h-10 items-center gap-2.5 rounded-full px-3 py-2 text-[12.5px] font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                    collapsed && 'lg:justify-center lg:px-0',
                    active ? 'bg-white/25 ring-1 ring-inset ring-white/25' : 'hover:bg-white/15',
                  )}
                >
                  {content}
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="flex min-h-10 items-center gap-2.5 rounded-full px-3 py-2 text-[12.5px] font-bold leading-tight text-white/55"
                >
                  {content}
                </span>
              );
            })}
        </nav>

        <div
          className={cn(
            'mt-5 border-t border-white/20 px-4 pt-4 text-[10px] leading-relaxed text-white/65',
            collapsed && 'lg:hidden',
          )}
        >
          <div className="mb-1 flex items-center gap-2 font-semibold text-white">
            <Settings aria-hidden="true" className="size-3.5" />
            CDR PIM · Plataforma operacional
          </div>
          Catálogo maestro de productos
        </div>
      </aside>
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
  if (pathname.startsWith('/equivalences')) return view === 'homologs' ? 12 : 11;
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
        collapsed ? 'lg:left-16' : 'lg:left-[220px]',
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [screenIndexOpen, setScreenIndexOpen] = useState(false);
  const [screenIndexMode, setScreenIndexMode] = useState<'map' | 'states'>('map');
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const navigationId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const roleLabel = actor.roles.length > 0 ? actor.roles.join(' · ') : 'Sin rol asignado';

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
      if (saved === 'collapsed') setSidebarCollapsed(true);
      if (saved === 'expanded') setSidebarCollapsed(false);
    } catch {
      // Storage can be unavailable in hardened/private browser modes; navigation still works.
    }
  }, []);

  const closeMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };

  const toggleNavigation = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarCollapsed((value) => {
        const next = !value;
        try {
          window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, next ? 'collapsed' : 'expanded');
        } catch {
          // Preference persistence is optional and never blocks navigation.
        }
        return next;
      });
      return;
    }
    setMenuOpen(true);
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
      <div className="min-h-dvh w-full max-w-full overflow-x-clip bg-white">
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-cdr-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Saltar al contenido
        </a>
        <div className="flex min-h-dvh w-full max-w-full bg-white">
          <Sidebar
            open={menuOpen}
            collapsed={sidebarCollapsed}
            onClose={closeMenu}
            labelledBy={navigationId}
            capabilities={actor.capabilities}
          />
          <div className="min-w-0 max-w-full flex-1">
            <header className="sticky top-0 z-30 flex h-14 max-w-full items-center justify-between gap-2 border-b border-border bg-white/95 px-3 backdrop-blur sm:px-5 lg:px-[35px]">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Button
                  ref={menuButton}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={toggleNavigation}
                  aria-expanded={menuOpen || !sidebarCollapsed}
                  aria-controls={navigationId}
                  aria-label={
                    sidebarCollapsed ? 'Expandir menú principal' : 'Contraer menú principal'
                  }
                >
                  <Menu className="size-5" />
                </Button>
                <div className="relative">
                  <Button
                    type="button"
                    className="h-9 rounded-xl px-3 text-xs sm:px-4 sm:text-sm"
                    onClick={() => {
                      if (screenIndexOpen && screenIndexMode === 'map') {
                        setScreenIndexOpen(false);
                      } else {
                        openScreenIndex('map');
                      }
                    }}
                    aria-expanded={screenIndexOpen}
                    aria-controls="screen-index"
                  >
                    <LayoutGrid aria-hidden="true" className="size-4" />
                    Pantallas
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  </Button>
                  {screenIndexOpen ? (
                    <div
                      id="screen-index"
                      className="absolute left-0 top-11 z-50 max-h-[min(76vh,720px)] w-[min(88vw,760px)] overflow-y-auto rounded-xl border bg-white p-4 shadow-xl sm:p-5"
                    >
                      {screenIndexMode === 'map' ? (
                        <>
                          <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                              <strong className="text-sm text-cdr-ink">
                                Mapa de pantallas · {TOTAL_SCREEN_COUNT} rutas
                              </strong>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Inicio de sesión más {AUTHENTICATED_SCREEN_COUNT} rutas
                                autenticadas. Cada pantalla identifica sus capacidades operativas y
                                sus límites actuales.
                              </p>
                            </div>
                            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-primary">
                              {TOTAL_SCREEN_COUNT} rutas
                            </span>
                          </div>
                          <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-muted-foreground">
                            <b className="text-foreground">Inicio de sesión</b> · acceso protegido;
                            disponible al cerrar la sesión actual.
                          </div>
                          <div className="grid gap-4 sm:grid-cols-3">
                            {screenIndex.map((group) => (
                              <section key={group.label}>
                                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                                  {group.label}
                                </h2>
                                <div className="grid gap-1">
                                  {group.links
                                    .filter(([, , capability]) =>
                                      actor.capabilities.includes(capability),
                                    )
                                    .map(([label, href]) => (
                                      <Link
                                        key={label}
                                        href={href}
                                        onClick={() => setScreenIndexOpen(false)}
                                        className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-primary"
                                      >
                                        {label}
                                      </Link>
                                    ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-4">
                            <strong className="text-sm text-cdr-ink">Estados UX compartidos</strong>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Comportamientos verificables que complementan las {TOTAL_SCREEN_COUNT}{' '}
                              pantallas.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {uxStates.map(([label, description]) => (
                              <div key={label} className="rounded-lg border bg-slate-50 p-3">
                                <strong className="text-xs">{label}</strong>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                  {description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
                <Button
                  asChild
                  variant="secondary"
                  className="max-w-[180px] px-3 sm:w-[240px] sm:justify-start"
                >
                  <Link
                    href={
                      actor.capabilities.includes('menu:ai-quality:view')
                        ? '/quality?view=search'
                        : '/products'
                    }
                    aria-label="Abrir la búsqueda del PIM"
                  >
                    <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="hidden truncate text-muted-foreground sm:inline">
                      Buscar en PIM…
                    </span>
                  </Link>
                </Button>
                <div className="hidden max-w-[220px] text-right leading-tight md:block">
                  <strong className="block truncate text-sm" title={actor.email}>
                    {actorName(actor.email)}
                  </strong>
                  <span
                    className="mt-1 block truncate rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
                    title={roleLabel}
                  >
                    {roleLabel}
                  </span>
                </div>
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-cdr-ink text-xs font-semibold text-white"
                  aria-label={`Perfil: ${actor.email}`}
                >
                  {actorInitials(actor.email)}
                </span>
                {logoutError ? (
                  <span role="alert" className="hidden max-w-48 text-xs text-destructive sm:inline">
                    {logoutError}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  aria-label={loggingOut ? 'Cerrando sesión' : 'Cerrar sesión'}
                  title={loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
                >
                  <LogOut aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </header>

            <main
              id="main-content"
              tabIndex={-1}
              className="min-h-[calc(100dvh-96px)] min-w-0 max-w-full overflow-x-clip bg-white px-3 pb-16 pt-4 outline-none sm:px-5 lg:px-[35px]"
            >
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
      </div>
    </ColumnOrderUserProvider>
  );
}
