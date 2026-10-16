import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AuthActor } from '@/lib/auth';

import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/bff-client', () => ({
  logoutSession: vi.fn(),
}));

const actor: AuthActor = {
  id: 'admin',
  email: 'admin@casadelruliman.local',
  roles: ['ADMINISTRADOR'],
  capabilities: ['menu:products:view', 'menu:equivalences:view'],
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
});
