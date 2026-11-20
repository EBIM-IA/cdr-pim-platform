import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModulePolicyEditor } from './module-policy-editor';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/bff-client', () => ({ authenticatedBffFetch: mocks.fetch }));

const matrix = [
  { role: 'ADMINISTRADOR', capabilities: ['menu:administration:view', 'technical-sheets:bulk'] },
  { role: 'COMPRAS', capabilities: ['menu:products:view', 'technical-sheets:bulk'] },
  { role: 'VENTAS', capabilities: ['menu:products:view'] },
];
const modules = [{ label: 'Productos', capability: 'menu:products:view' as const }];
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('ModulePolicyEditor bulk technical sheets', () => {
  it.each([
    ['VENTAS', true],
    ['COMPRAS', false],
  ])(
    'persists the bulk PDF permission for %s without changing individual access',
    async (role, visible) => {
      mocks.fetch.mockResolvedValue(
        Response.json({
          policies: [{ role, capability: 'technical-sheets:bulk', visible }],
        }),
      );
      render(<ModulePolicyEditor matrix={matrix} modules={modules} canManage />);
      const control = screen.getByRole('checkbox', { name: `Fichas técnicas PDF para ${role}` });
      expect(control).toHaveProperty('checked', !visible);
      fireEvent.click(control);

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
      expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/identity/module-policies', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role, capability: 'technical-sheets:bulk', visible }),
      });
      expect(control).toHaveProperty('checked', visible);
      expect(screen.getByRole('status')).toHaveTextContent('Permiso actualizado');
      expect(
        screen.getByText(/La ficha individual sigue disponible para todos los perfiles/u),
      ).toBeVisible();
      expect(screen.getByRole('checkbox', { name: 'Productos para VENTAS' })).toBeChecked();
    },
  );

  it('keeps the administrator grant fixed and prevents changes by a read-only actor', () => {
    const { rerender } = render(<ModulePolicyEditor matrix={matrix} modules={modules} canManage />);
    const administrator = screen.getByRole('checkbox', {
      name: 'Fichas técnicas PDF para ADMINISTRADOR',
    });
    expect(administrator).toBeChecked();
    expect(administrator).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Fichas técnicas PDF para COMPRAS' }),
    ).toBeEnabled();

    rerender(<ModulePolicyEditor matrix={matrix} modules={modules} canManage={false} />);
    for (const role of ['ADMINISTRADOR', 'COMPRAS', 'VENTAS'])
      expect(
        screen.getByRole('checkbox', { name: `Fichas técnicas PDF para ${role}` }),
      ).toBeDisabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('preserves the current grant when the server rejects the policy change', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    render(<ModulePolicyEditor matrix={matrix} modules={modules} canManage />);
    const control = screen.getByRole('checkbox', { name: 'Fichas técnicas PDF para COMPRAS' });
    fireEvent.click(control);

    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo guardar la política');
    expect(control).toBeChecked();
    expect(control).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
