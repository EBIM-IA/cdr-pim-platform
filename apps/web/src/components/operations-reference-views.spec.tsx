import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdministrationReferenceView,
  IntegrationsReferenceView,
} from './operations-reference-views';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  fetch: vi.fn(),
  reviews: vi.fn(),
  categories: vi.fn(),
  workbook: vi.fn(),
  downloadCsv: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/bff-client', () => ({ authenticatedBffFetch: mocks.fetch }));
vi.mock('@/lib/quality-governance-api', () => ({ listQualityReviews: mocks.reviews }));
vi.mock('@/lib/catalog-admin-api', () => ({ listAdminCategories: mocks.categories }));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchCatalogWorkbook: mocks.workbook }));
vi.mock('@/lib/tabular-export', () => ({ downloadCsv: mocks.downloadCsv }));
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
    expect(
      within(navigation).getByRole('checkbox', { name: 'Productos para ADMINISTRADOR' }),
    ).toBeChecked();
    expect(
      within(navigation).getByRole('checkbox', { name: 'Productos para VENTAS' }),
    ).not.toBeChecked();
    expect(
      within(navigation).getByRole('checkbox', {
        name: 'Catálogos de productos para ADMINISTRADOR',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('row', { name: 'Configurar plantillas, usuarios y roles Sí No No' }),
    ).toBeVisible();
    expect(screen.queryByText('Simular rol de la sesión')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar permisos' })).toBeDisabled();
  });
  it('persists module visibility through the API without granting role editing', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        policies: [{ role: 'VENTAS', capability: 'menu:products:view', visible: true }],
      }),
    });
    render(
      <AdministrationReferenceView
        workspace={workspace}
        view="roles"
        actor={{
          id: 'admin',
          email: 'admin@example.test',
          roles: ['ADMINISTRADOR'],
          capabilities: ['administration:manage'],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Productos para VENTAS' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/identity/module-policies',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: 'VENTAS', capability: 'menu:products:view', visible: true }),
        }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Permiso actualizado');
    expect(screen.getByRole('checkbox', { name: 'Productos para VENTAS' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Administración para ADMINISTRADOR' }),
    ).toBeDisabled();
  });
  it('restores module defaults from the authenticated server response', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        policies: [
          { role: 'VENTAS', capability: 'menu:products:view', visible: true },
          { role: 'VENTAS', capability: 'menu:applications:view', visible: false },
        ],
      }),
    });
    render(
      <AdministrationReferenceView
        workspace={workspace}
        view="roles"
        actor={{
          id: 'admin',
          email: 'admin@example.test',
          roles: ['ADMINISTRADOR'],
          capabilities: ['administration:manage'],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Volver a los módulos por defecto' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        '/api/identity/module-policies/reset',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await screen.findByText(
      'Módulos por defecto restablecidos. Los permisos para modificar datos se conservan.',
    );
    expect(screen.getByRole('checkbox', { name: 'Productos para VENTAS' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Aplicaciones para VENTAS' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Editar permisos' })).toBeDisabled();
  });
  it('uses the configured account list and its actual scoped totals', () => {
    render(
      <AdministrationReferenceView
        workspace={{
          ...workspace,
          metrics: [
            { key: 'users', label: 'Cuentas locales configuradas', format: 'integer', value: 1 },
            { key: 'active-users', label: 'Habilitados', format: 'integer', value: 1 },
            { key: 'inactive-users', label: 'Inactivos', format: 'integer', value: 0 },
          ],
          rows: [
            {
              id: 'user:local',
              values: {
                kind: 'Cuenta local habilitada',
                grant: 'ADMINISTRADOR',
                actor: 'local@example.test',
              },
            },
          ],
        }}
        view="users"
      />,
    );
    expect(screen.getByText('local@example.test')).toBeVisible();
    expect(
      screen.getByText(/Estos totales no representan un directorio corporativo/),
    ).toBeVisible();
    expect(screen.queryByText('Directorio pendiente de habilitar')).not.toBeInTheDocument();
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
  it('filters real local accounts and opens the selected user without pretending identity writes are available', () => {
    render(
      <AdministrationReferenceView
        workspace={{
          ...workspace,
          rows: [
            { id: 'user:admin', values: { actor: 'admin@example.test', grant: 'ADMINISTRADOR' } },
            { id: 'user:sales', values: { actor: 'sales@example.test', grant: 'VENTAS' } },
          ],
        }}
        view="users"
      />,
    );
    fireEvent.change(screen.getByLabelText('Filtrar por rol'), { target: { value: 'VENTAS' } });
    expect(screen.queryByText('admin@example.test')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar usuarios (CSV)' }));
    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      {
        headers: ['Nombre', 'Correo', 'Rol', 'Estado'],
        rows: [['Cuenta local', 'sales@example.test', 'VENTAS', 'Habilitada en este entorno']],
      },
      'usuarios-locales-filtrados',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver usuario' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Detalle de usuario' }));
    expect(drawer.getByLabelText('Correo')).toHaveValue('sales@example.test');
    expect(drawer.getByLabelText('Rol')).toHaveValue('VENTAS');
    expect(drawer.getByRole('button', { name: 'Guardar usuario' })).toBeDisabled();
    fireEvent.click(drawer.getByRole('button', { name: 'Cerrar' }));
    fireEvent.change(screen.getByLabelText('Buscar usuario'), { target: { value: 'NO-EXISTE' } });
    expect(screen.getByText('No hay usuarios que coincidan con los filtros.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Nuevo usuario' })).getByText(
        /no crea cuentas, envía invitaciones/,
      ),
    ).toBeVisible();
  });
  it('connects the source candidates to the SKU in context and keeps remote TecDoc consultation blocked', async () => {
    mocks.categories.mockResolvedValue([
      {
        id: 'category-1',
        name: 'Rodamientos',
        sourcePriority: { fabricante: 1, archivo: 2, tecdoc: 3, manual: 4 },
      },
    ]);
    mocks.workbook.mockResolvedValue({
      items: [
        {
          id: 'product-1',
          sku: 'SKU-REAL',
          brand: 'CDR',
          category: { id: 'category-1' },
          template: { name: 'Rodamiento' },
        },
      ],
    });
    mocks.reviews.mockResolvedValue({
      items: [
        {
          id: 'review-1',
          productId: 'product-1',
          sku: 'SKU-REAL',
          attributeKey: 'diametro',
          candidates: [{ source: 'fabricante', value: 0, evidence: 'Ficha PDF conservada' }],
          status: 'pending',
          proposedIndex: 0,
          reason: null,
        },
      ],
      total: 1,
    });
    render(
      <IntegrationsReferenceView
        workspace={{ ...workspace, slug: 'integrations' }}
        view="sources"
      />,
    );
    await waitFor(() =>
      expect(mocks.reviews).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'product-1', kind: 'attribute' }),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole('link', { name: 'Comparar' })).toHaveAttribute(
      'href',
      '/quality?view=conflict&productId=product-1&reviewId=review-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enriquecer con TecDoc' }));
    const drawer = within(screen.getByRole('dialog', { name: 'TecDoc' }));
    expect(drawer.getByText('SKU: SKU-REAL')).toBeVisible();
    expect(drawer.getByRole('button', { name: 'Consultar SKU en TecDoc' })).toBeDisabled();
    expect(drawer.getByText(/No se ha ejecutado una consulta/)).toBeVisible();
    expect(
      screen.queryByText('La consulta de candidatos de fuentes todavía no está disponible.'),
    ).not.toBeInTheDocument();
  });
});
