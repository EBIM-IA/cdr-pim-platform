import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
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
    {
      role: 'ADMINISTRADOR',
      capabilities: [
        'catalog:read',
        'administration:manage',
        'menu:products:view',
        'menu:catalogs:view',
      ],
    },
    { role: 'COMPRAS', capabilities: ['catalog:read'] },
    { role: 'VENTAS', capabilities: ['catalog:read'] },
  ],
};
afterEach(cleanup);
describe('Reference operations layouts', () => {
  it('renders the actual role matrix from the API without offering a role simulator', () => {
    render(<AdministrationReferenceView workspace={workspace} view="roles" />);
    expect(
      within(screen.getByRole('table', { name: 'Matriz de permisos por rol' })).getAllByRole(
        'columnheader',
      ),
    ).toHaveLength(4);
    const navigation = screen.getByRole('table', { name: 'Módulos visibles por perfil' });
    expect(within(navigation).getByRole('row', { name: 'Productos Sí No No' })).toBeVisible();
    expect(
      within(navigation).getByRole('row', { name: 'Catálogos de productos Sí No No' }),
    ).toBeVisible();
    expect(
      screen.getByRole('row', { name: 'Configurar plantillas, usuarios y roles Sí No No' }),
    ).toBeVisible();
    expect(screen.queryByText('Simular rol de la sesión')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar permisos' })).toBeDisabled();
  });
  it('shows an empty durable inbox without claiming catalog processing', () => {
    render(
      <IntegrationsReferenceView
        workspace={{
          ...workspace,
          slug: 'integrations',
          rows: [
            {
              id: 'ax',
              values: { system: 'Dynamics AX', configured: false, state: 'Receptor PUSH durable' },
            },
          ],
          axInbox: {
            totalBatches: 0,
            totalRecords: 0,
            recentBatches: [],
            selectedBatch: null,
            records: [],
            page: 1,
            pageSize: 100,
            catalogApplicationEnabled: false,
          },
        }}
        view="monitor"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Recibidos' })).toBeVisible();
    expect(screen.getByText('Todavía no se recibieron lotes AX.')).toBeVisible();
    expect(screen.getByText('Espera reglas aprobadas por CDR')).toBeVisible();
    expect(screen.getByText('Receptor PUSH durable')).toBeVisible();
  });
});
