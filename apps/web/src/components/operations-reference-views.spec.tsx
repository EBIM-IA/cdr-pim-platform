import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AdministrationReferenceView,
  IntegrationsReferenceView,
} from './operations-reference-views';

const workspace: WorkspaceDto = {
  slug: 'administration',
  operationalStatus: 'partial',
  generatedAt: '2026-10-22T00:00:00.000Z',
  metrics: [],
  rows: [],
  columns: [],
  totalRows: 0,
  notices: [],
  actions: [],
  roleCapabilities: [
    { role: 'ADMINISTRADOR', capabilities: ['catalog:read', 'administration:manage'] },
    { role: 'COMPRAS', capabilities: ['catalog:read'] },
    { role: 'VENTAS', capabilities: ['catalog:read'] },
  ],
};
afterEach(cleanup);
describe('Reference operations layouts', () => {
  it('renders the actual role matrix from the API without offering a role simulator', () => {
    render(<AdministrationReferenceView workspace={workspace} view="roles" />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
    expect(
      screen.getByRole('row', { name: 'Configurar plantillas, usuarios y roles Sí No No' }),
    ).toBeVisible();
    expect(screen.queryByText('Simular rol de la sesión')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar permisos' })).toBeDisabled();
  });
  it('preserves execution and error table structure without turning absent telemetry into zero', () => {
    render(
      <IntegrationsReferenceView
        workspace={{
          ...workspace,
          slug: 'integrations',
          rows: [{ id: 'ax', values: { system: 'Dynamics AX', configured: false } }],
        }}
        view="monitor"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Recibidos' })).toBeVisible();
    expect(
      screen.getByText('El historial de ejecuciones externas aún no está disponible.'),
    ).toBeVisible();
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByText('Pendiente de conexión')).toBeVisible();
  });
});
