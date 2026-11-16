import type { AuthActor } from '@/lib/auth';
import { moduleMenuCapabilities, moduleSlugs } from '@/lib/module-definitions';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('@/lib/server-auth', () => ({ getCurrentActor: mocks.actor }));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/applications-workspace', () => ({
  ApplicationsWorkspace: ({ canWrite }: { canWrite: boolean }) => (
    <section>
      Aplicaciones
      <button disabled={!canWrite}>Editar aplicación</button>
    </section>
  ),
}));
vi.mock('@/components/categories-admin-workspace', () => ({
  CategoriesAdminWorkspace: () => <section>Categorías</section>,
}));
vi.mock('@/components/templates-admin-workspace', () => ({
  TemplatesAdminWorkspace: () => <section>Plantillas</section>,
}));
vi.mock('@/components/documents-workspace', () => ({
  DocumentsWorkspace: () => <section>Documentos</section>,
}));
vi.mock('@/components/equivalences-workspace', () => ({
  EquivalencesWorkspace: () => <section>Equivalencias</section>,
}));
vi.mock('@/components/imports-workspace', () => ({
  ImportsWorkspace: () => <section>Importaciones</section>,
}));
vi.mock('@/components/module-workspace', () => ({
  ModuleWorkspace: () => <section>Módulo</section>,
}));
vi.mock('@/components/reference-workspace', () => ({
  ReferenceWorkspace: () => <section>Referencia</section>,
}));
vi.mock('@/components/reports-workspace', () => ({
  ReportsWorkspace: () => <section>Reportes</section>,
}));
vi.mock('@/components/products-catalog', () => ({
  ProductsCatalog: () => <section>Productos</section>,
}));
vi.mock('@/components/product-detail-view', () => ({
  ProductDetailView: () => <section>Detalle</section>,
}));
vi.mock('@/components/catalog-home', () => ({
  CatalogHome: () => <section>Inicio</section>,
}));
vi.mock('@/components/dashboard-overview', () => ({
  DashboardOverview: () => <section>Dashboard</section>,
}));

import ModulePage from './[module]/page';
import ProtectedLayout from './layout';
import DashboardPage from './page';
import ProductDetailPage from './products/[id]/page';
import ProductsPage from './products/page';

const sales: AuthActor = {
  id: 'sales-local',
  email: 'ventas@example.test',
  roles: ['VENTAS'],
  capabilities: [
    'identity:self:read',
    'catalog:read',
    'product-catalogs:read',
    'attributes:read',
    'applications:read',
    'equivalences:read',
    'menu:products:view',
    'menu:catalogs:view',
  ],
};

function setRequest(actor: AuthActor | null, path: string) {
  mocks.actor.mockResolvedValue(actor);
  mocks.headers.mockResolvedValue(new Headers({ 'x-cdr-return-to': path }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setRequest(sales, '/');
});
afterEach(cleanup);

describe('protected route capability policy', () => {
  it('keeps an unauthenticated request behind login with its local return path', async () => {
    setRequest(null, '/applications?q=6204');
    await expect(ProtectedLayout({ children: <span>Contenido</span> })).rejects.toThrow(
      'REDIRECT:/login?returnTo=%2Fapplications%3Fq%3D6204',
    );
  });

  it.each(['COMPRAS', 'VENTAS'] as const)(
    'rejects direct hidden module requests for default %s',
    async (role) => {
      for (const module of moduleSlugs.filter((slug) => slug !== 'catalogs')) {
        setRequest({ ...sales, roles: [role] }, `/${module}?tab=all`);
        await expect(ProtectedLayout({ children: <span>Contenido</span> })).rejects.toThrow(
          'REDIRECT:/',
        );
      }
    },
  );

  it.each(['/', '/products', '/products/product-id?tab=sheet', '/catalogs'])(
    'allows default consultation route %s',
    async (path) => {
      setRequest(sales, path);
      render(await ProtectedLayout({ children: <span>Contenido permitido</span> }));
      expect(screen.getByText('Contenido permitido')).toBeInTheDocument();
    },
  );

  it('honors a hidden module for administrators instead of bypassing the effective policy', async () => {
    setRequest({ ...sales, roles: ['ADMINISTRADOR'] }, '/applications');
    await expect(ProtectedLayout({ children: <span>Contenido</span> })).rejects.toThrow(
      'REDIRECT:/',
    );
  });

  it('allows an enabled application module through the layout and page without granting editing', async () => {
    const actor: AuthActor = {
      ...sales,
      capabilities: [...sales.capabilities, 'menu:applications:view'],
    };
    setRequest(actor, '/applications?sku=6204');
    const page = await ModulePage({ params: Promise.resolve({ module: 'applications' }) });
    render(await ProtectedLayout({ children: page }));
    expect(screen.getByText('Aplicaciones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar aplicación' })).toBeDisabled();
    expect(actor.capabilities).not.toContain('applications:write');
    expect(actor.capabilities).not.toContain('administration:manage');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(moduleSlugs)(
    'guards the direct %s page when its menu capability is absent',
    async (module) => {
      const actor = {
        ...sales,
        capabilities: sales.capabilities.filter(
          (capability) => capability !== moduleMenuCapabilities[module],
        ),
      };
      setRequest(actor, `/${module}`);
      render(await ModulePage({ params: Promise.resolve({ module }) }));
      expect(screen.getByText('Sin permisos para esta pantalla')).toBeInTheDocument();
    },
  );

  it.each(['list', 'detail'] as const)('guards the direct product %s page', async (page) => {
    setRequest(
      { ...sales, capabilities: sales.capabilities.filter((cap) => cap !== 'menu:products:view') },
      '/products',
    );
    render(
      page === 'list'
        ? await ProductsPage({ searchParams: Promise.resolve({}) })
        : await ProductDetailPage({ params: Promise.resolve({ id: 'product-id' }) }),
    );
    expect(screen.getByText('Sin permisos para esta pantalla')).toBeInTheDocument();
  });

  it('redirects the home page to an enabled module when home and products are hidden', async () => {
    setRequest(
      { ...sales, capabilities: sales.capabilities.filter((cap) => cap !== 'menu:products:view') },
      '/',
    );
    await expect(DashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT:/catalogs',
    );
  });

  it('renders no catalog when the home page has no enabled modules', async () => {
    setRequest({ ...sales, capabilities: ['catalog:read'] }, '/');
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Sin módulos habilitados')).toBeInTheDocument();
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument();
  });
});
