import type { WorkspaceDto, WorkspaceSlug } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OperationsSecondaryWorkspace,
  type OperationsSecondaryView,
  type OperationsWorkspaceSlug,
} from '@/components/operations-secondary-workspace';

afterEach(cleanup);

function workspace(slug: WorkspaceSlug): WorkspaceDto {
  if (slug === 'publication') {
    return {
      slug,
      operationalStatus: 'partial',
      generatedAt: '2026-10-05T12:00:00.000Z',
      metrics: [
        { key: 'draft', label: 'Borradores', value: 1, format: 'integer' },
        { key: 'in-review', label: 'En revisión', value: 2, format: 'integer' },
      ],
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'status', label: 'Estado PIM', type: 'status' },
      ],
      rows: [{ id: 'p-1', values: { sku: 'SKU-REAL-1', status: 'in_review' } }],
      totalRows: 1,
      notices: [
        {
          id: 'eligibility',
          severity: 'warning',
          title: 'Elegibilidad pendiente',
          message: 'El estado no prueba elegibilidad para el canal.',
        },
      ],
      actions: [
        {
          id: 'refresh-publication',
          label: 'Actualizar publicación',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/workspaces/publication',
        },
        {
          id: 'publish',
          label: 'Publicar en canal',
          availability: 'blocked',
          reason: 'No existe una regla de elegibilidad aprobada.',
        },
      ],
    };
  }

  if (slug === 'integrations') {
    return {
      slug,
      operationalStatus: 'partial',
      generatedAt: '2026-10-05T12:00:00.000Z',
      metrics: [
        {
          key: 'configured-components',
          label: 'Componentes configurados',
          value: 1,
          format: 'integer',
        },
      ],
      columns: [
        { key: 'system', label: 'Sistema', type: 'text' },
        { key: 'configured', label: 'Configurado', type: 'status' },
        { key: 'state', label: 'Estado real', type: 'status' },
      ],
      rows: [
        {
          id: 'ax',
          values: {
            system: 'Dynamics AX',
            configured: false,
            state: 'Adaptador real no implementado',
          },
        },
      ],
      totalRows: 1,
      notices: [],
      actions: [
        {
          id: 'refresh-integrations',
          label: 'Actualizar integraciones',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/workspaces/integrations',
        },
        {
          id: 'sync-ax',
          label: 'Sincronizar AX',
          availability: 'blocked',
          reason: 'Faltan autenticación y conectividad VPN.',
        },
      ],
    };
  }

  if (slug === 'administration') {
    return {
      slug,
      operationalStatus: 'partial',
      generatedAt: '2026-10-05T12:00:00.000Z',
      metrics: [
        {
          key: 'actor',
          label: 'Usuario autenticado',
          value: 'admin@cdr.local',
          format: 'text',
        },
      ],
      columns: [
        { key: 'kind', label: 'Tipo', type: 'status' },
        { key: 'grant', label: 'Asignación efectiva', type: 'text' },
        { key: 'actor', label: 'Actor', type: 'text' },
      ],
      rows: [
        {
          id: 'role:admin',
          values: { kind: 'Rol', grant: 'ADMIN', actor: 'admin@cdr.local' },
        },
      ],
      totalRows: 1,
      notices: [],
      actions: [
        {
          id: 'current-session',
          label: 'Consultar sesión actual',
          availability: 'supported',
          method: 'GET',
          endpoint: '/api/v1/auth/me',
        },
        {
          id: 'manage-users',
          label: 'Gestionar usuarios',
          availability: 'blocked',
          reason: 'Falta decidir el proveedor empresarial.',
        },
      ],
    };
  }

  return {
    slug: 'reports',
    operationalStatus: 'operational',
    generatedAt: '2026-10-05T12:00:00.000Z',
    metrics: [{ key: 'products', label: 'Productos', value: 7, format: 'integer' }],
    columns: [
      { key: 'section', label: 'Sección', type: 'text' },
      { key: 'indicator', label: 'Indicador', type: 'text' },
      { key: 'value', label: 'Cantidad', type: 'number' },
    ],
    rows: [
      {
        id: 'status:draft',
        values: { section: 'Estado', indicator: 'draft', value: 2 },
      },
    ],
    totalRows: 1,
    notices: [],
    actions: [],
  };
}

function renderView(slug: OperationsWorkspaceSlug, view: OperationsSecondaryView) {
  return render(
    <OperationsSecondaryWorkspace workspace={workspace(slug)} slug={slug} view={view} />,
  );
}

describe('OperationsSecondaryWorkspace', () => {
  it('presenta publicación con métricas, candidatos y bloqueo reales', () => {
    renderView('publication', 'channels');

    expect(screen.getByText('Borradores')).toBeVisible();
    expect(screen.getByText('SKU-REAL-1')).toBeVisible();
    expect(screen.getByText('No existe una regla de elegibilidad aprobada.')).toBeVisible();
    expect(screen.queryByText('45.280')).not.toBeInTheDocument();
  });

  it('mantiene la consulta de imágenes deshabilitada sin contrato', () => {
    renderView('publication', 'images');

    expect(screen.getByRole('textbox', { name: 'SKU a consultar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Consultar imágenes' })).toBeDisabled();
    expect(screen.getByText(/No se presentan identificadores|todavía no expone/)).toBeVisible();
  });

  it('ejecuta únicamente una acción soportada cuando recibe manejador', () => {
    const onRefresh = vi.fn();
    render(
      <OperationsSecondaryWorkspace
        workspace={workspace('integrations')}
        slug="integrations"
        view="monitor"
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Sincronizar AX' })).not.toBeInTheDocument();
    expect(screen.getByText('Faltan autenticación y conectividad VPN.')).toBeVisible();
  });

  it('muestra la identidad efectiva y bloquea el alta de usuarios', () => {
    renderView('administration', 'users');

    expect(screen.getByText('admin@cdr.local')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeDisabled();
    expect(screen.queryByText('junior@cdr.example')).not.toBeInTheDocument();
  });

  it('presenta reportes de búsqueda sin cifras ilustrativas', () => {
    renderView('reports', 'searches');

    expect(screen.getAllByText('Telemetría de búsqueda no disponible')).toHaveLength(2);
    expect(screen.getByText('Términos frecuentes')).toBeVisible();
    expect(screen.queryByText('18.420')).not.toBeInTheDocument();
  });

  it('rechaza una vista conectada al workspace incorrecto', () => {
    render(
      <OperationsSecondaryWorkspace workspace={workspace('reports')} slug="reports" view="users" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Vista y workspace incompatibles');
  });
});
