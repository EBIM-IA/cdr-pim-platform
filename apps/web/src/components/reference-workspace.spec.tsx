import type { WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceData = vi.hoisted(() => ({ useWorkspaceData: vi.fn() }));
const catalogView = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('@/components/product-catalogs-workspace', () => ({
  ProductCatalogsWorkspace: (props: { canManage: boolean; canShare: boolean }) => {
    catalogView.render(props);
    return <div>Gestión de catálogos PDF</div>;
  },
}));

vi.mock('@/components/use-workspace-data', () => workspaceData);

import { ReferenceWorkspace } from '@/components/reference-workspace';
import { moduleDefinitions } from '@/lib/module-definitions';

const reportsWorkspace: WorkspaceDto = {
  slug: 'reports',
  operationalStatus: 'partial',
  generatedAt: '2026-10-19T12:00:00.000Z',
  metrics: [],
  columns: [
    { key: 'section', label: 'Sección', type: 'text' },
    { key: 'indicator', label: 'Indicador', type: 'text' },
    { key: 'value', label: 'Cantidad', type: 'number' },
  ],
  rows: [
    {
      id: 'summary',
      values: { section: 'Estado', indicator: 'draft', value: 1 },
    },
  ],
  totalRows: 1,
  notices: [],
  actions: [],
};

const catalogsWorkspace: WorkspaceDto = {
  slug: 'catalogs',
  operationalStatus: 'blocked',
  generatedAt: '2026-10-20T12:00:00.000Z',
  metrics: [
    {
      key: 'persistence',
      label: 'Registro persistente',
      value: 'Pendiente de contrato',
      format: 'text',
    },
  ],
  columns: [],
  rows: [],
  totalRows: 0,
  notices: [
    {
      id: 'catalogs-blocked',
      severity: 'warning',
      title: 'Capacidad visible, todavía no operativa',
      message: 'No existe persistencia aprobada para catálogos PDF.',
    },
  ],
  actions: [
    {
      id: 'refresh',
      label: 'Actualizar datos',
      availability: 'supported',
      method: 'GET',
      endpoint: '/api/v1/workspaces/catalogs',
    },
    {
      id: 'upload-catalog',
      label: 'Cargar catálogo PDF',
      availability: 'blocked',
      reason: 'Faltan permisos, límites y almacenamiento.',
    },
    {
      id: 'share-catalog',
      label: 'Compartir catálogo',
      availability: 'blocked',
      reason: 'Falta el contrato de enlaces públicos.',
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/reports');
});

describe('ReferenceWorkspace report views', () => {
  it('requests the API projection associated with each report selector', () => {
    workspaceData.useWorkspaceData.mockReturnValue({
      workspace: reportsWorkspace,
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    render(<ReferenceWorkspace definition={moduleDefinitions.reports} />);

    expect(workspaceData.useWorkspaceData).toHaveBeenLastCalledWith('reports', {
      report: 'summary',
    });
    expect(screen.getByRole('button', { name: /Reporte atributos/u })).toBeVisible();
    expect(screen.getByRole('button', { name: /Reporte general/u })).toBeVisible();
    expect(screen.getByRole('button', { name: /Resultados de período/u })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Reporte general/u }));
    expect(workspaceData.useWorkspaceData).toHaveBeenLastCalledWith('reports', {
      report: 'general_results',
    });

    fireEvent.click(screen.getByRole('button', { name: /Resultados de período/u }));
    expect(workspaceData.useWorkspaceData).toHaveBeenLastCalledWith('reports', {
      report: 'period_results',
    });
  });

  it('connects the live PDF workspace with actor capabilities', () => {
    workspaceData.useWorkspaceData.mockReturnValue({
      workspace: { ...catalogsWorkspace, operationalStatus: 'operational', notices: [] },
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    const { rerender } = render(
      <ReferenceWorkspace
        definition={moduleDefinitions.catalogs}
        actor={{
          id: 'buyer',
          email: 'buyer@example.invalid',
          roles: ['COMPRAS'],
          capabilities: [
            'product-catalogs:read',
            'product-catalogs:write',
            'product-catalogs:share',
          ],
        }}
      />,
    );
    expect(workspaceData.useWorkspaceData).toHaveBeenLastCalledWith('catalogs', {});
    expect(screen.getByRole('heading', { name: 'Catálogos' })).toBeVisible();
    expect(catalogView.render).toHaveBeenLastCalledWith(
      expect.objectContaining({ canManage: true, canShare: true }),
    );
    rerender(
      <ReferenceWorkspace
        definition={moduleDefinitions.catalogs}
        actor={{
          id: 'sales',
          email: 'sales@example.invalid',
          roles: ['VENTAS'],
          capabilities: ['product-catalogs:read', 'product-catalogs:share'],
        }}
      />,
    );
    expect(catalogView.render).toHaveBeenLastCalledWith(
      expect.objectContaining({ canManage: false, canShare: true }),
    );
  });
});
