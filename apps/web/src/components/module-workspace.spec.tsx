import type { WorkspaceAction } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceActions } from '@/components/module-workspace';

afterEach(cleanup);

const actions: WorkspaceAction[] = [
  {
    id: 'refresh',
    label: 'Actualizar proyección',
    availability: 'supported',
    method: 'GET',
    endpoint: '/api/v1/workspaces/reports',
  },
  {
    id: 'browse-products',
    label: 'Consultar productos',
    availability: 'supported',
    method: 'GET',
    endpoint: '/api/v1/products',
  },
  {
    id: 'current-session',
    label: 'Consultar sesión actual',
    availability: 'supported',
    method: 'GET',
    endpoint: '/api/v1/auth/me',
  },
  {
    id: 'export-report',
    label: 'Exportar reporte',
    availability: 'blocked',
    reason: 'El backend todavía no publica exportaciones.',
  },
];

describe('WorkspaceActions', () => {
  it('ejecuta los controles web de cada acción soportada', () => {
    const onReload = vi.fn();
    const onBrowseProducts = vi.fn();
    const onRevalidateSession = vi.fn();

    render(
      <WorkspaceActions
        actions={actions}
        loading={false}
        onReload={onReload}
        onBrowseProducts={onBrowseProducts}
        onRevalidateSession={onRevalidateSession}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar datos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir productos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revalidar sesión' }));

    expect(onReload).toHaveBeenCalledOnce();
    expect(onBrowseProducts).toHaveBeenCalledOnce();
    expect(onRevalidateSession).toHaveBeenCalledOnce();
  });

  it('mantiene las capacidades bloqueadas sin un control ejecutable', () => {
    render(
      <WorkspaceActions
        actions={actions}
        loading={false}
        onReload={vi.fn()}
        onBrowseProducts={vi.fn()}
        onRevalidateSession={vi.fn()}
      />,
    );

    const blockedCard = screen.getByText('Exportar reporte').closest('li');
    expect(blockedCard).not.toBeNull();
    expect(within(blockedCard as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    expect(within(blockedCard as HTMLElement).getByText(/todavía no publica/)).toBeVisible();
  });

  it('deshabilita la recarga mientras hay una solicitud en curso', () => {
    render(
      <WorkspaceActions
        actions={actions.slice(0, 1)}
        loading
        onReload={vi.fn()}
        onBrowseProducts={vi.fn()}
        onRevalidateSession={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled();
  });
});
