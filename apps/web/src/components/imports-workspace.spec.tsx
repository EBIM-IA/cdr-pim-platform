import type { ImportBatchDto, WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceData } from '@/components/use-workspace-data';
import { fetchCatalogCategories, fetchCatalogSchema } from '@/lib/dynamic-catalog-api';
import {
  confirmImport,
  enqueueImportConfirmation,
  getImportExecution,
  getImport,
  previewImport,
} from '@/lib/operational-api';
import { downloadCsv } from '@/lib/tabular-export';

import { ImportsWorkspace } from './imports-workspace';

vi.mock('@/lib/application-columns-api', () => ({
  getApplicationColumns: vi.fn(async () => ({ columns: [], version: 0 })),
}));
vi.mock('@/lib/tabular-export', () => ({ downloadCsv: vi.fn() }));

vi.mock('@/components/use-workspace-data', () => ({ useWorkspaceData: vi.fn() }));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogCategories: vi.fn(),
  fetchCatalogSchema: vi.fn(),
}));
vi.mock('@/lib/operational-api', () => ({
  confirmImport: vi.fn(),
  enqueueImportConfirmation: vi.fn(),
  getImportExecution: vi.fn(),
  getImport: vi.fn(),
  previewImport: vi.fn(),
}));

const batch: ImportBatchDto = {
  id: '11111111-1111-4111-8111-111111111111',
  target: 'applications',
  format: 'csv',
  status: 'previewed',
  executionMode: 'asynchronous',
  idempotencyKey: 'applications-test-key',
  categoryCode: null,
  totalRows: 1,
  validRows: 1,
  invalidRows: 0,
  rows: [
    {
      rowNumber: 2,
      valid: true,
      data: {
        unifiedCode: 'D1672',
        vehicleType: 'Automóvil',
        make: 'Toyota',
        model: 'Hilux',
      },
      errors: [],
      warnings: [],
    },
  ],
  createdAt: '2026-10-05T10:00:00.000Z',
  confirmedAt: null,
};

const confirmedBatch: ImportBatchDto = {
  ...batch,
  status: 'confirmed',
  confirmedAt: '2026-10-05T10:01:00.000Z',
};

const historyWorkspace: WorkspaceDto = {
  slug: 'imports',
  operationalStatus: 'partial',
  generatedAt: '2026-10-05T10:00:00.000Z',
  metrics: [
    { key: 'batches', label: 'Lotes persistidos', value: 1, format: 'integer' },
    { key: 'applied-rows', label: 'Registros aplicados', value: 7, format: 'integer' },
    { key: 'invalid-rows', label: 'Filas con error', value: 0, format: 'integer' },
    { key: 'processing', label: 'En proceso', value: 2, format: 'integer' },
  ],
  columns: [
    { key: 'target', label: 'Destino', type: 'text' },
    { key: 'originalFileName', label: 'Archivo', type: 'text' },
    { key: 'sourceFileFormat', label: 'Formato', type: 'text' },
    { key: 'totalRows', label: 'Registros', type: 'number' },
    { key: 'validRows', label: 'Válidos', type: 'number' },
    { key: 'invalidRows', label: 'Con error', type: 'number' },
    { key: 'status', label: 'Estado', type: 'status' },
    { key: 'createdBy', label: 'Actor', type: 'text' },
    { key: 'createdAt', label: 'Creado', type: 'datetime' },
  ],
  rows: [
    {
      id: batch.id,
      values: {
        target: 'applications',
        format: 'json',
        sourceFileFormat: 'csv',
        originalFileName: 'aplicaciones.csv',
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        status: 'previewed',
        createdBy: 'admin',
        createdAt: batch.createdAt,
      },
    },
  ],
  totalRows: 1,
  notices: [],
  actions: [],
};

const reload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/imports');
  vi.mocked(useWorkspaceData).mockReturnValue({
    workspace: historyWorkspace,
    loading: false,
    error: null,
    reload,
  });
  vi.mocked(previewImport).mockResolvedValue(batch);
  const execution = {
    batchId: batch.id,
    status: 'completed' as const,
    processedRows: 1,
    totalRows: 1,
    queuedAt: batch.createdAt,
    startedAt: batch.createdAt,
    updatedAt: batch.createdAt,
    completedAt: batch.createdAt,
    error: null,
  };
  vi.mocked(enqueueImportConfirmation).mockImplementation(async () => {
    vi.mocked(getImport).mockResolvedValue(confirmedBatch);
    vi.mocked(getImportExecution).mockResolvedValue(execution);
    return execution;
  });
  vi.mocked(getImportExecution).mockResolvedValue(null);
  vi.mocked(confirmImport).mockResolvedValue({ ...confirmedBatch, executionMode: 'synchronous' });
  vi.mocked(getImport).mockResolvedValue(batch);
  vi.mocked(fetchCatalogSchema).mockResolvedValue({
    category: {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'filtros-de-aire',
      name: 'Filtros',
    },
    template: {
      id: '33333333-3333-4333-8333-333333333332',
      variantKey: '22.2',
      name: 'Filtro',
      version: 1,
    },
    columns: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        key: 'descripcion_tecnica',
        label: 'Descripción técnica',
        dataType: 'text',
        unit: null,
        allowedValues: [],
        required: false,
        replicable: false,
        searchable: false,
        includeInTechnicalSheet: false,
        sourceAuthority: 'pim',
        position: 0,
        permissions: { edit: true, import: true, export: true },
      },
    ],
  });
  vi.mocked(fetchCatalogCategories).mockResolvedValue([
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'filtros-de-aire',
      name: 'Filtros de aire',
      path: 'Filtros / Aire',
      templateId: '33333333-3333-4333-8333-333333333331',
      templateVariantKey: '22.1',
      templateName: 'Filtro de aire rectangular',
      templateVersion: 1,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'filtros-de-aire',
      name: 'Filtros de aire',
      path: 'Filtros / Aire',
      templateId: '33333333-3333-4333-8333-333333333332',
      templateVariantKey: '22.2',
      templateName: 'Filtro de aire cilíndrico',
      templateVersion: 1,
    },
  ]);
});

afterEach(() => cleanup());

describe('ImportsWorkspace', () => {
  it('explica cómo abrir un resultado cuando la ruta no tiene un lote seleccionado', async () => {
    window.history.replaceState({}, '', '/imports?view=result');
    render(<ImportsWorkspace canExecute />);
    expect(await screen.findByRole('heading', { name: 'Resultado de importación' })).toBeVisible();
    expect(screen.getByText('Selecciona un lote de importación')).toBeVisible();
    expect(getImport).not.toHaveBeenCalled();
  });

  it('abre una nueva carga desde OEM con el destino y la plantilla correspondientes', async () => {
    window.history.replaceState({}, '', '/imports?view=new&target=oem');
    render(<ImportsWorkspace canExecute />);

    expect(await screen.findByLabelText('Destino')).toHaveValue('oem');
    expect(screen.getByDisplayValue(/codigo_unificador,codigo_oem,marcas/)).toBeInTheDocument();
    expect(screen.getByText('Arrastra un archivo XLSX o CSV')).toBeInTheDocument();
  });

  it('exports only the rows matching file search and translated status filters', () => {
    const homologId = '22222222-2222-4222-8222-222222222222';
    vi.mocked(useWorkspaceData).mockReturnValue({
      workspace: {
        ...historyWorkspace,
        totalRows: 2,
        rows: [
          ...historyWorkspace.rows,
          {
            id: homologId,
            values: {
              ...historyWorkspace.rows[0]!.values,
              target: 'homologs',
              status: 'confirmed',
              originalFileName: 'referencias.csv',
              sourceFileFormat: 'csv',
              totalRows: 3,
              validRows: 3,
            },
          },
        ],
      },
      loading: false,
      error: null,
      reload,
    });
    render(<ImportsWorkspace canExecute />);
    expect(screen.getByText('Homólogos externos')).toBeVisible();
    expect(screen.getByText('Confirmado')).toBeVisible();
    const metrics = screen.getByRole('region', { name: 'Indicadores' });
    expect(within(metrics).getByText('Registros aplicados').parentElement).toHaveTextContent('7');
    expect(within(metrics).getByText('En proceso').parentElement).toHaveTextContent('2');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar importaciones' }), {
      target: { value: 'referencias.csv' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Filtrar importaciones: Estado' }), {
      target: { value: 'confirmado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar historial CSV' }));
    expect(downloadCsv).toHaveBeenCalledWith(
      {
        headers: ['Lote', ...historyWorkspace.columns.map((column) => column.label)],
        rows: [
          [
            homologId,
            'Homólogos externos',
            'referencias.csv',
            'CSV',
            3,
            3,
            0,
            'Confirmado',
            'admin',
            expect.any(String),
          ],
        ],
      },
      'Historial de importaciones',
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar importaciones' }), {
      target: { value: 'no-existe' },
    });
    expect(screen.getByRole('button', { name: 'Exportar historial CSV' })).toBeDisabled();
  });

  it('labels missing original file metadata explicitly without guessing from the transport format', () => {
    vi.mocked(useWorkspaceData).mockReturnValue({
      workspace: {
        ...historyWorkspace,
        rows: [
          {
            ...historyWorkspace.rows[0]!,
            values: {
              ...historyWorkspace.rows[0]!.values,
              originalFileName: null,
              sourceFileFormat: null,
              format: 'json',
            },
          },
        ],
      },
      loading: false,
      error: null,
      reload,
    });
    render(<ImportsWorkspace canExecute />);
    expect(screen.getByText('Sin archivo registrado')).toBeVisible();
    expect(screen.getByText('No registrado')).toBeVisible();
    expect(screen.queryByText('JSON')).toBeNull();
  });

  it('opens a persisted result from the history and keeps it addressable by URL', async () => {
    vi.mocked(getImport).mockResolvedValue({
      ...batch,
      format: 'json',
      originalFileName: 'repuestos-original.xlsx',
      sourceFileFormat: 'xlsx',
    });
    render(<ImportsWorkspace canExecute />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver resultado' }));

    expect(
      await screen.findByRole('heading', { name: 'Resultado de importación' }),
    ).toBeInTheDocument();
    expect(getImport).toHaveBeenCalledWith(batch.id);
    expect(window.location.search).toContain('view=result');
    expect(window.location.search).toContain(`batch=${batch.id}`);
    expect(screen.getByText('D1672')).toBeInTheDocument();
    expect(screen.getByText('repuestos-original.xlsx')).toBeVisible();
    expect(screen.getByText('XLSX')).toBeVisible();
    expect(screen.queryByText('aplicaciones.csv')).toBeNull();
    expect(screen.queryByText('JSON')).toBeNull();
  });

  it('does not reconstruct an original file for a legacy result', async () => {
    window.history.replaceState({}, '', `/imports?view=result&batch=${batch.id}`);
    vi.mocked(getImport).mockResolvedValue({
      ...batch,
      format: 'json',
      originalFileName: null,
      sourceFileFormat: null,
    });
    render(<ImportsWorkspace canExecute />);
    expect(await screen.findByText('Sin archivo registrado')).toBeVisible();
    expect(screen.getByText('No registrado')).toBeVisible();
    expect(screen.queryByText('aplicaciones.csv')).toBeNull();
    expect(screen.queryByText('JSON')).toBeNull();
  });

  it('uses synchronous confirmation in local memory mode without leaving an execution queued', async () => {
    window.history.replaceState({}, '', `/imports?view=result&batch=${batch.id}`);
    vi.mocked(getImport).mockResolvedValue({ ...batch, executionMode: 'synchronous' });
    render(<ImportsWorkspace canExecute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar lote' }));
    await waitFor(() => expect(confirmImport).toHaveBeenCalledWith(batch.id));
    expect(enqueueImportConfirmation).not.toHaveBeenCalled();
    expect(await screen.findByText('Confirmado')).toBeInTheDocument();
    expect(
      screen.getByText(/El resultado y sus validaciones están guardados en el historial/),
    ).toBeInTheDocument();
  });

  it('reopens a corrected upload from a rejected result without reapplying the old lot', async () => {
    window.history.replaceState({}, '', `/imports?view=result&batch=${batch.id}`);
    vi.mocked(getImport).mockResolvedValue({
      ...confirmedBatch,
      invalidRows: 1,
      rows: [{ ...batch.rows[0]!, valid: false, errors: ['model is required'] }],
    });
    render(<ImportsWorkspace canExecute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reprocesar corregidos' }));
    expect(screen.getByLabelText('Destino')).toHaveValue('applications');
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled();
    expect(screen.getByText(/Carga el archivo con las filas corregidas/)).toBeVisible();
    expect(confirmImport).not.toHaveBeenCalled();
    expect(enqueueImportConfirmation).not.toHaveBeenCalled();
  });

  it('runs the five approved steps and confirms only the real preview', async () => {
    render(<ImportsWorkspace canExecute />);

    fireEvent.click(screen.getByRole('button', { name: /Nueva importación/ }));
    expect(screen.getByText('Arrastra un archivo XLSX o CSV')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('SKU e identidad del lote')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText(/Mapeo de columnas/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Continuar/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Validación por registro')).toBeInTheDocument();
    expect(
      screen.getByText('Revisa los errores y advertencias antes de confirmar.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('Confirmar procesamiento')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar lote/ }));

    await waitFor(() => expect(enqueueImportConfirmation).toHaveBeenCalledWith(batch.id));
    expect(
      await screen.findByRole('heading', { name: 'Resultado de importación' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Confirmado')).toBeInTheDocument();
    expect(window.location.search).toContain('view=result');
  });

  it('preserves read-only mode through every wizard action', () => {
    render(<ImportsWorkspace canExecute={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Nueva importación/ }));
    expect(screen.getByText('Acceso de solo lectura')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled();
  });

  it('offers OEM as its own target with the OEM template instead of the homolog template', () => {
    render(<ImportsWorkspace canExecute />);

    fireEvent.click(screen.getByRole('button', { name: /Nueva importación/ }));
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'oem' } });

    expect(screen.getByDisplayValue(/codigo_unificador,codigo_oem,marcas/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/04465-0K240/)).not.toHaveValue(
      expect.stringContaining('codigo_homologo'),
    );
  });

  it('sends the explicit template variant for a category import', async () => {
    render(<ImportsWorkspace canExecute />);

    fireEvent.click(screen.getByRole('button', { name: /Nueva importación/ }));
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'category' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    const templateId = '33333333-3333-4333-8333-333333333332';
    fireEvent.change(
      await screen.findByRole('combobox', { name: 'Categoría y variante de plantilla' }),
      { target: { value: templateId } },
    );
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    await waitFor(() =>
      expect(screen.getByLabelText('Destino de descripcion_tecnica')).toHaveValue(
        'descripcion_tecnica',
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Continuar/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    await waitFor(() =>
      expect(previewImport).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'category',
          categoryCode: 'filtros-de-aire',
          templateId,
        }),
      ),
    );
  });

  it('shows persisted row warnings without rejecting an applicable row', async () => {
    vi.mocked(getImport).mockResolvedValue({
      ...batch,
      rows: [
        {
          ...batch.rows[0]!,
          warnings: ['Se ignoró la columna archivo_tecnico: archivo no importable'],
        },
      ],
    });
    render(<ImportsWorkspace canExecute />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver resultado' }));

    expect(await screen.findByText(/Se ignoró la columna archivo_tecnico/)).toBeInTheDocument();
    expect(screen.getByText('Advertencia')).toBeInTheDocument();
    expect(screen.queryByText('Rechazado')).not.toBeInTheDocument();
  });
});

it('maps customer headers before previewing the actual records and leaves unmapped columns out', async () => {
  render(<ImportsWorkspace canExecute />);
  fireEvent.click(screen.getByRole('button', { name: /Nueva importación/u }));
  fireEvent.change(screen.getByLabelText('Contenido del archivo'), {
    target: {
      value:
        'Grupo cliente,Marca cliente,Modelo cliente,Nota interna\nD1672,Toyota,Hilux,no importar',
    },
  });
  fireEvent.click(screen.getByRole('button', { name: /Continuar/u }));
  fireEvent.click(screen.getByRole('button', { name: /Continuar/u }));
  fireEvent.change(screen.getByLabelText('Destino de Grupo cliente'), {
    target: { value: 'unifiedCode' },
  });
  fireEvent.change(screen.getByLabelText('Destino de Marca cliente'), {
    target: { value: 'make' },
  });
  fireEvent.change(screen.getByLabelText('Destino de Modelo cliente'), {
    target: { value: 'model' },
  });
  await waitFor(() => expect(screen.getByRole('button', { name: /Continuar/u })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /Continuar/u }));
  await waitFor(() =>
    expect(previewImport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'json',
        originalFileName: 'applications.csv',
        sourceFileFormat: 'csv',
        records: [{ unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' }],
      }),
    ),
  );
});

it('accepts a dropped CSV file and rejects JSON as an upload format', async () => {
  render(<ImportsWorkspace canExecute />);
  fireEvent.click(screen.getByRole('button', { name: /Nueva importación/u }));
  const drop = screen.getByText('Arrastra un archivo XLSX o CSV').closest('label')!;
  fireEvent.drop(drop, {
    dataTransfer: {
      files: [
        {
          name: 'cliente.csv',
          size: 60,
          text: async () => 'unifiedCode,make,model\nD1672,Toyota,Hilux',
        },
      ],
    },
  });
  await screen.findByText('cliente.csv');
  expect(screen.getByLabelText('Contenido del archivo')).toHaveValue(
    'unifiedCode,make,model\nD1672,Toyota,Hilux',
  );
  fireEvent.drop(drop, {
    dataTransfer: { files: [{ name: 'datos.json', size: 2, text: async () => '[]' }] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona un archivo XLSX o CSV.');
});

it('opens a rejected row with its real errors and downloads them', async () => {
  vi.mocked(getImport).mockResolvedValue({
    ...batch,
    invalidRows: 1,
    validRows: 0,
    rows: [{ ...batch.rows[0]!, valid: false, errors: ['El código unificador no existe'] }],
  });
  render(<ImportsWorkspace canExecute />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver resultado' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle fila 2' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('El código unificador no existe');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar configuración' }));
  expect(screen.getByRole('button', { name: 'Descargar errores y advertencias' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Descargar errores y advertencias' }));
  expect(downloadCsv).toHaveBeenCalledWith(
    expect.objectContaining({
      headers: expect.arrayContaining(['Errores', 'Advertencias']),
      rows: [expect.arrayContaining(['El código unificador no existe'])],
    }),
    expect.stringContaining('Errores importación'),
  );
});

it('preserves a file and mapping when canceling a navigation with unsaved changes', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<ImportsWorkspace canExecute />);
  fireEvent.click(screen.getByRole('button', { name: /Nueva importación/u }));
  fireEvent.change(screen.getByLabelText('Contenido del archivo'), {
    target: { value: 'unifiedCode,make,model\nG1,Toyota,Hilux' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ver historial' }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByLabelText('Contenido del archivo')).toHaveValue(
    'unifiedCode,make,model\nG1,Toyota,Hilux',
  );
  confirm.mockRestore();
});
