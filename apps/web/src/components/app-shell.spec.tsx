import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AuthActor } from '@/lib/auth';

import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/catalogs',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/bff-client', () => ({
  logoutSession: vi.fn(),
}));

const actor: AuthActor = {
  id: 'admin',
  email: 'admin@casadelruliman.local',
  roles: ['ADMINISTRADOR'],
  capabilities: ['menu:products:view', 'menu:equivalences:view', 'menu:catalogs:view'],
};

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(cleanup);

describe('AppShell navigation', () => {
  it('uses the client-approved name for the unifier and homolog module', () => {
    render(
      <AppShell actor={actor}>
        <p>Contenido</p>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Código Unificador y Homólogos' })).toHaveAttribute(
      'href',
      '/equivalences',
    );
    expect(screen.queryByRole('link', { name: 'Equivalencias' })).not.toBeInTheDocument();
  });

  it('integrates the authorized catalogs workspace in the sidebar, map and reference pager', () => {
    render(
      <AppShell actor={actor}>
        <p>Contenido</p>
      </AppShell>,
    );

    const navigation = screen.getByRole('navigation', { name: 'Módulos del PIM' });
    expect(within(navigation).getByRole('link', { name: 'Catálogos' })).toHaveAttribute(
      'href',
      '/catalogs',
    );
    expect(
      screen.getByText('Pantalla 35 de 35 · ref. #37 · Catálogos de productos'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mapa · 35 rutas' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pantallas' }));

    expect(screen.getByText('Mapa de pantallas · 35 rutas')).toBeInTheDocument();
    expect(screen.getByText(/Inicio de sesión más 34 rutas autenticadas/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Catálogos de productos' })).toHaveAttribute(
      'href',
      '/catalogs',
    );
  });

  it('hides catalogs navigation and map entries without the required capability', () => {
    const restrictedActor: AuthActor = {
      ...actor,
      capabilities: actor.capabilities.filter((capability) => capability !== 'menu:catalogs:view'),
    };

    render(
      <AppShell actor={restrictedActor}>
        <p>Contenido</p>
      </AppShell>,
    );

    const navigation = screen.getByRole('navigation', { name: 'Módulos del PIM' });
    expect(within(navigation).queryByRole('link', { name: 'Catálogos' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pantallas' }));

    expect(screen.queryByRole('link', { name: 'Catálogos de productos' })).not.toBeInTheDocument();
  });

  it('skips unauthorized screens when paging from catalogs', () => {
    const salesActor: AuthActor = {
      ...actor,
      roles: ['VENTAS'],
      capabilities: ['menu:reports:view', 'menu:catalogs:view'],
    };

    render(
      <AppShell actor={salesActor}>
        <p>Contenido</p>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /Anterior/u })).toHaveAttribute(
      'href',
      '/reports?view=searches',
    );
    expect(screen.queryByRole('link', { name: /Siguiente/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
  });
});
