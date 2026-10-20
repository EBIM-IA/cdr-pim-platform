import type { WorkspaceDto, WorkspaceSlug } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const codeAffixApi = vi.hoisted(() => ({
  createCodeAffix: vi.fn(),
  deactivateCodeAffix: vi.fn(),
  listCodeAffixes: vi.fn().mockResolvedValue([]),
  parseCode: vi.fn(),
  updateCodeAffix: vi.fn(),
  validateCodeAffix: vi.fn(),
}));
const tabularExport = vi.hoisted(() => ({
  downloadCsv: vi.fn(),
  downloadXlsx: vi.fn(),
}));

vi.mock('@/lib/code-affix-api', () => codeAffixApi);
vi.mock('@/lib/tabular-export', () => tabularExport);

import {
  OperationsSecondaryWorkspace,
  type OperationsSecondaryView,
  type OperationsWorkspaceSlug,
} from '@/components/operations-secondary-workspace';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
        { key: 'category', label: 'Categoría', type: 'text' },
        { key: 'template', label: 'Plantilla', type: 'text' },
        { key: 'status', label: 'Estado PIM', type: 'status' },
        { key: 'eligibility', label: 'Elegibilidad base', type: 'status' },
      ],
      rows: [
        {
          id: 'p-1',
          values: {
            sku: 'SKU-REAL-1',
            category: 'Rodamientos',
            template: 'Rodamiento Rígido de Bolas',
            status: 'in_review',
            eligibility: 'No publicable',
          },
        },
      ],
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
        {
          id: 'configure-publication-fields',
          label: 'Configurar campos por categoría',
          availability: 'blocked',
          reason: 'Falta el contrato para persistir la selección por categoría.',
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
        {
          id: 'ax-mock',
          values: {
            system: 'Mock AX (desarrollo)',
            configured: false,
            state: 'Deshabilitado por defecto',
          },
        },
      ],
      totalRows: 2,
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
          id: 'receive-ax-mock-batch',
          label: 'Mock AX local',
          availability: 'blocked',
          reason: 'El receptor provisional está deshabilitado.',
        },
        {
          id: 'sync-ax',
          label: 'Integración AX de producción',
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
    operationalStatus: 'partial',
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
      {
        id: 'brand:fag',
        values: { section: 'Marca', indicator: 'FAG', value: 1 },
      },
    ],
    totalRows: 2,
    notices: [],
    actions: [
      {
        id: 'refresh',
        label: 'Actualizar datos',
        availability: 'supported',
        method: 'GET',
        endpoint: '/api/v1/workspaces/reports?report=summary',
      },
    ],
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
    expect(screen.getAllByText('SKU-REAL-1').length).toBeGreaterThan(0);
    expect(screen.getByText('No existe una regla de elegibilidad aprobada.')).toBeVisible();
    expect(screen.getAllByText('Rodamientos').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Configurar Campos' })).toBeDisabled();
    expect(
      screen.getByText('Falta el contrato para persistir la selección por categoría.'),
    ).toBeVisible();
    expect(screen.queryByText('45.280')).not.toBeInTheDocument();
  });

  it('no mantiene una vista previa cuando la búsqueda no tiene candidatos', () => {
    renderView('publication', 'channels');

    fireEvent.change(screen.getByRole('searchbox', { name: /Buscar candidatos/u }), {
      target: { value: 'SKU-QUE-NO-EXISTE' },
    });

    expect(screen.getByText('No hay candidatos que coincidan con la búsqueda.')).toBeVisible();
    expect(screen.getByText('Sin SKU seleccionado')).toBeVisible();
  });

  it('muestra reportes en tabla lineal y exporta solo las filas filtradas', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderView('reports', 'reports');

    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeVisible();
    expect(screen.getByText('draft')).toBeVisible();
    expect(screen.getByText('FAG')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Nuevo Formato desde Plantilla/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por sección' }), {
      target: { value: 'Marca' },
    });
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir / Guardar PDF' }));

    expect(tabularExport.downloadCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ['Sección', 'Indicador', 'Cantidad'],
        rows: [['Marca', 'FAG', 1]],
      }),
      'reporte-cdr',
    );
    expect(tabularExport.downloadXlsx).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector('#cdr-report-print-area')).toBeInTheDocument();
  });

  it('presenta el reporte general con columnas históricas vacías y exportación propia', () => {
    const report: WorkspaceDto = {
      ...workspace('reports'),
      columns: [
        { key: 'sku', label: 'Código artículo', type: 'text' },
        { key: 'previousApplications', label: 'Aplicaciones anteriores', type: 'number' },
        { key: 'currentApplications', label: 'Aplicaciones actuales', type: 'number' },
      ],
      rows: [
        {
          id: 'product-1',
          values: {
            sku: 'SKU-REAL-1',
            previousApplications: null,
            currentApplications: 3,
          },
        },
      ],
      totalRows: 1,
      notices: [
        {
          id: 'general-report-no-baseline',
          severity: 'warning',
          title: 'Baseline histórico no disponible',
          message: 'Las columnas anteriores se entregan vacías.',
        },
      ],
    };
    render(
      <OperationsSecondaryWorkspace workspace={report} slug="reports" view="general-report" />,
    );

    expect(screen.getByRole('heading', { name: 'REPORTE GENERAL (RESULTADOS)' })).toBeVisible();
    expect(screen.getByText('Baseline histórico no disponible')).toBeVisible();
    expect(screen.getByText('SKU-REAL-1')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Filtrar por sección' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    expect(tabularExport.downloadXlsx).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ['Código artículo', 'Aplicaciones anteriores', 'Aplicaciones actuales'],
        rows: [['SKU-REAL-1', '', 3]],
      }),
      'reporte-general-resultados',
    );
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

  it('explica el mock AX deshabilitado sin presentar ejecuciones ficticias', () => {
    renderView('integrations', 'batches');

    expect(screen.getByText('Mock AX local')).toBeVisible();
    expect(screen.getByText('El receptor provisional está deshabilitado.')).toBeVisible();
    expect(screen.getByText('Contrato provisional draft-0')).toBeVisible();
    expect(screen.queryByText('AX-2026-0001')).not.toBeInTheDocument();
  });

  it('muestra los endpoints del mock AX cuando la API declara el receptor local', () => {
    const enabled: WorkspaceDto = {
      ...workspace('integrations'),
      actions: [
        {
          id: 'receive-ax-mock-batch',
          label: 'Recibir lote en mock AX',
          availability: 'supported',
          method: 'POST',
          endpoint: '/api/v1/integrations/ax/mock/batches',
        },
      ],
    };

    render(<OperationsSecondaryWorkspace workspace={enabled} slug="integrations" view="batches" />);

    expect(screen.getByText('Mock AX local disponible')).toBeVisible();
    expect(screen.getByText('POST /api/v1/integrations/ax/mock/batches')).toBeVisible();
    expect(screen.getByText('GET /api/v1/integrations/ax/mock/batches/:batchId')).toBeVisible();
    expect(screen.getByText('X-AX-Mock-Key')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Ejecutar/u })).not.toBeInTheDocument();
  });

  it('muestra la identidad efectiva y bloquea el alta de usuarios', () => {
    renderView('administration', 'users');

    expect(screen.getByText('admin@cdr.local')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeDisabled();
    expect(screen.queryByText('junior@cdr.example')).not.toBeInTheDocument();
  });

  it('conecta el catálogo de prefijos y sufijos sin precargar sugerencias ficticias', async () => {
    renderView('administration', 'settings');

    expect(await screen.findByText('No hay reglas persistidas')).toBeVisible();
    expect(codeAffixApi.listCodeAffixes).toHaveBeenCalledWith(
      { includeInactive: false },
      expect.any(AbortSignal),
    );
    const create = screen.getByRole('button', { name: 'Agregar regla' });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(screen.getByRole('heading', { name: 'Nueva regla' })).toBeVisible();
    expect(screen.queryByText(/57 sugerencias/i)).not.toBeInTheDocument();
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
