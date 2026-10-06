'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { AuthCapability } from '@cdr/contracts';
import {
  BarChart3,
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
  { reference: 4, href: '/', label: 'Dashboard' },
  { reference: 5, href: '/products', label: 'Productos' },
  { reference: 6, href: '/products', label: 'Detalle de producto' },
  { reference: 7, href: '/products', label: 'Editar enriquecimiento' },
  { reference: 8, href: '/categories', label: 'Categorías y líneas' },
  { reference: 9, href: '/templates', label: 'Plantilla dinámica' },
  { reference: 10, href: '/applications', label: 'Aplicaciones' },
  { reference: 11, href: '/equivalences', label: 'Código unificador y equivalencias' },
  {
    reference: 12,
    href: '/equivalences?view=homologs',
    label: 'Identificadores y homólogos',
  },
  { reference: 13, href: '/documents', label: 'Imágenes y documentos' },
  { reference: 14, href: '/imports', label: 'Importaciones' },
  { reference: 15, href: '/imports?view=new', label: 'Nueva importación' },
  { reference: 16, href: '/imports?view=result', label: 'Resultado de importación' },
  { reference: 17, href: '/quality?view=search', label: 'Búsqueda inteligente' },
  { reference: 18, href: '/quality?view=extraction', label: 'Revisión de extracción IA' },
  { reference: 19, href: '/quality?view=commercial', label: 'Descripción comercial con IA' },
  { reference: 20, href: '/quality?view=quality', label: 'Calidad del catálogo' },
  { reference: 21, href: '/quality?view=duplicates', label: 'Posibles duplicados' },
  { reference: 22, href: '/quality?view=review', label: 'Bandeja de revisión y aprobación' },
  { reference: 23, href: '/quality?view=sources', label: 'Prioridad de fuentes' },
  { reference: 24, href: '/quality?view=conflict', label: 'Resolver conflicto de fuentes' },
  { reference: 25, href: '/publication?view=channels', label: 'Publicación por canal' },
  { reference: 26, href: '/publication?view=prestashop', label: 'Canal PrestaShop' },
  { reference: 27, href: '/publication?view=images', label: 'Migración de imágenes PrestaShop' },
  { reference: 28, href: '/integrations?view=sources', label: 'Fuentes externas' },
  { reference: 29, href: '/integrations?view=monitor', label: 'Monitor de integraciones' },
  { reference: 30, href: '/integrations?view=batches', label: 'Detalle de lote Sismetic / AX' },
  { reference: 31, href: '/administration?view=users', label: 'Usuarios' },
  { reference: 32, href: '/administration?view=roles', label: 'Roles y permisos' },
  { reference: 33, href: '/administration?view=audit', label: 'Auditoría y trazabilidad' },
  { reference: 34, href: '/reports?view=reports', label: 'Reportes' },
  { reference: 35, href: '/reports?view=searches', label: 'Reporte de búsquedas' },
  {
    reference: 36,
    href: '/administration?view=settings',
    label: 'Catálogos de configuración',
  },
] as const;

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
    label: 'Equivalencias',
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
      ['Detalle de producto', '/products', 'menu:products:view'],
      ['Editar enriquecimiento', '/products', 'menu:products:view'],
      ['Categorías y líneas', '/categories', 'menu:categories:view'],
      ['Plantilla dinámica', '/templates', 'menu:templates:view'],
      ['Aplicaciones', '/applications', 'menu:applications:view'],
      ['Código unificador', '/equivalences', 'menu:equivalences:view'],
      ['Identificadores y homólogos', '/equivalences?view=homologs', 'menu:equivalences:view'],
      ['Imágenes y documentos', '/documents', 'menu:documents:view'],
    ],
  },
  {
    label: 'IA y calidad',
    links: [
      ['Búsqueda inteligente', '/quality?view=search', 'menu:ai-quality:view'],
      ['Extracción IA', '/quality?view=extraction', 'menu:ai-quality:view'],
      ['Descripción comercial', '/quality?view=commercial', 'menu:ai-quality:view'],
      ['Calidad del catálogo', '/quality?view=quality', 'menu:ai-quality:view'],
      ['Posibles duplicados', '/quality?view=duplicates', 'menu:ai-quality:view'],
      ['Bandeja de revisión', '/quality?view=review', 'menu:ai-quality:view'],
      ['Prioridad de fuentes', '/quality?view=sources', 'menu:ai-quality:view'],
      ['Resolver conflicto', '/quality?view=conflict', 'menu:ai-quality:view'],
    ],
  },
  {
    label: 'Operación y gobierno',
    links: [
      ['Importaciones', '/imports', 'menu:imports:view'],
      ['Nueva importación', '/imports?view=new', 'menu:imports:view'],
      ['Resultado de importación', '/imports?view=result', 'menu:imports:view'],
      ['Publicación por canal', '/publication?view=channels', 'menu:publication:view'],
      ['Canal PrestaShop', '/publication?view=prestashop', 'menu:publication:view'],
      ['Migración de imágenes', '/publication?view=images', 'menu:publication:view'],
      ['Fuentes externas', '/integrations?view=sources', 'menu:integrations:view'],
      ['Monitor de integraciones', '/integrations?view=monitor', 'menu:integrations:view'],
      ['Lotes Sismetic / AX', '/integrations?view=batches', 'menu:integrations:view'],
      ['Usuarios', '/administration?view=users', 'menu:administration:view'],
      ['Roles y permisos', '/administration?view=roles', 'menu:administration:view'],
      ['Auditoría', '/administration?view=audit', 'menu:administration:view'],
      ['Reportes operativos', '/reports?view=reports', 'menu:reports:view'],
      ['Reporte de búsquedas', '/reports?view=searches', 'menu:reports:view'],
      ['Catálogos de configuración', '/administration?view=settings', 'menu:administration:view'],
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
          'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,260px)] flex-col overflow-y-auto bg-cdr-orange px-3 pb-5 pt-4 text-white shadow-sidebar transition-[transform,width] lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:translate-x-0',
          collapsed ? 'lg:w-[65px] lg:px-2' : 'lg:w-[222px]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div
          className={cn(
            'mb-3 flex min-h-[108px] items-center justify-between px-3 lg:justify-center',
            collapsed && 'lg:min-h-[58px] lg:px-0',
          )}
        >
          <Link
            href="/"
            onClick={onClose}
            aria-label="CDR PIM, ir al inicio"
            className={cn('flex items-center justify-center gap-2', collapsed && 'lg:gap-0')}
          >
            <Image
              src="/brand/cdr-isotipo.svg"
              alt=""
              width={76}
              height={66}
              priority
              className={cn('h-auto w-[76px]', collapsed && 'lg:w-[44px]')}
            />
            <span
              className={cn(
                'max-w-[92px] text-[15px] font-black italic leading-[0.82] tracking-[-0.055em] text-white',
                collapsed && 'lg:hidden',
              )}
            >
              CASA
              <br />
              DEL RULIMÁN
            </span>
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
                    'flex h-[42px] items-center gap-3 rounded-full px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
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
                  className="flex h-[42px] items-center gap-3 rounded-full px-3.5 text-[13px] font-bold text-white/55"
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
  onOpenIndex,
  onOpenStates,
}: {
  collapsed: boolean;
  onOpenIndex: () => void;
  onOpenStates: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = referencePage(pathname, searchParams.get('view'));
  const index = Math.max(
    0,
    pageSequence.findIndex((item) => item.reference === page),
  );
  const current = pageSequence[index] ?? pageSequence[0];
  const previous = index > 0 ? pageSequence[index - 1] : null;
  const next = index < pageSequence.length - 1 ? pageSequence[index + 1] : null;

  return (
    <footer
      className={cn(
        'fixed bottom-0 left-0 right-0 z-30 flex h-12 items-center justify-between gap-4 border-t border-border bg-white/95 px-4 backdrop-blur transition-[left] sm:px-6 lg:px-[35px]',
        collapsed ? 'lg:left-[65px]' : 'lg:left-[222px]',
      )}
    >
      <small className="hidden truncate text-[10px] text-muted-foreground sm:block">
        Pantalla {current.reference - 2} de 34 · ref. #{current.reference} · {current.label}
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
          Mapa 34/34
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

  const closeMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };

  const toggleNavigation = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarCollapsed((value) => !value);
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
    <div className="min-h-dvh w-full bg-white">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-cdr-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar al contenido
      </a>
      <div className="flex min-h-dvh w-full bg-white">
        <Sidebar
          open={menuOpen}
          collapsed={sidebarCollapsed}
          onClose={closeMenu}
          labelledBy={navigationId}
          capabilities={actor.capabilities}
        />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[73px] items-center justify-between gap-2 border-b border-border bg-white/95 px-3 backdrop-blur sm:px-5 lg:px-[35px]">
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
                aria-label="Abrir menú principal"
              >
                <Menu className="size-5" />
              </Button>
              <div className="relative">
                <Button
                  type="button"
                  className="h-10 rounded-xl px-3 text-xs sm:px-4 sm:text-sm"
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
                    className="absolute left-0 top-12 z-50 max-h-[min(76vh,720px)] w-[min(88vw,760px)] overflow-y-auto rounded-xl border bg-white p-4 shadow-xl sm:p-5"
                  >
                    {screenIndexMode === 'map' ? (
                      <>
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div>
                            <strong className="text-sm text-cdr-ink">
                              Mapa funcional · 34 pantallas
                            </strong>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Inicio de sesión más 33 pantallas autenticadas del diseño de
                              referencia.
                            </p>
                          </div>
                          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-primary">
                            34/34
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
                            Comportamientos verificables que complementan las 34 pantallas.
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
            className="min-h-[calc(100dvh-121px)] bg-white px-4 pb-[95px] pt-6 outline-none sm:px-6 sm:pt-8 lg:px-[35px] lg:pt-[34px]"
          >
            {children}
          </main>
          <FooterPager
            collapsed={sidebarCollapsed}
            onOpenIndex={() => openScreenIndex('map')}
            onOpenStates={() => openScreenIndex('states')}
          />
        </div>
      </div>
    </div>
  );
}
