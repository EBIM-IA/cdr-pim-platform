import type { ImportBatchDto, WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceData } from '@/components/use-workspace-data';
import { confirmImport, getImport, previewImport } from '@/lib/operational-api';

import { ImportsWorkspace } from './imports-workspace';

vi.mock('@/components/use-workspace-data', () => ({ useWorkspaceData: vi.fn() }));
vi.mock('@/lib/operational-api', () => ({
  confirmImport: vi.fn(),
  getImport: vi.fn(),
  previewImport: vi.fn(),
}));

const batch: ImportBatchDto = {
  id: '11111111-1111-4111-8111-111111111111',
  target: 'applications',
  format: 'csv',
  status: 'previewed',
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
    { key: 'confirmed', label: 'Lotes confirmados', value: 0, format: 'integer' },
    { key: 'invalid-rows', label: 'Filas con error', value: 0, format: 'integer' },
    { key: 'queue', label: 'Ejecución', value: 'Memoria local no durable', format: 'text' },
  ],
  columns: [
    { key: 'target', label: 'Destino', type: 'text' },
    { key: 'format', label: 'Formato', type: 'text' },
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
        format: 'csv',
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
  vi.mocked(confirmImport).mockResolvedValue(confirmedBatch);
  vi.mocked(getImport).mockResolvedValue(batch);
});

afterEach(() => cleanup());

describe('ImportsWorkspace', () => {
  it('opens a persisted result from the history and keeps it addressable by URL', async () => {
    render(<ImportsWorkspace canExecute />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver resultado' }));

    expect(
      await screen.findByRole('heading', { name: 'Resultado de importación' }),
    ).toBeInTheDocument();
    expect(getImport).toHaveBeenCalledWith(batch.id);
    expect(window.location.search).toContain('view=result');
    expect(window.location.search).toContain(`batch=${batch.id}`);
    expect(screen.getByText('D1672')).toBeInTheDocument();
  });

  it('runs the five approved steps and confirms only the real preview', async () => {
    render(<ImportsWorkspace canExecute />);

    fireEvent.click(screen.getByRole('button', { name: /Nueva importación/ }));
    expect(screen.getByText('Arrastra un archivo XLSX, CSV o JSON')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('SKU e identidad del lote')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText(/Mapeo de columnas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Validación por registro')).toBeInTheDocument();
    expect(screen.getByText('Respuesta real de la vista previa persistida.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('Confirmar procesamiento')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar lote/ }));

    await waitFor(() => expect(confirmImport).toHaveBeenCalledWith(batch.id));
    expect(
      await screen.findByRole('heading', { name: 'Resultado de importación' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
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
