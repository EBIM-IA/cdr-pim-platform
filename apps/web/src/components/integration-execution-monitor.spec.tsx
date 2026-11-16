import type { IntegrationExecutionMonitorDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const exports = vi.hoisted(() => ({ downloadCsv: vi.fn() }));
vi.mock('@/lib/tabular-export', () => exports);
import { IntegrationExecutionMonitor } from './integration-execution-monitor';

const data: IntegrationExecutionMonitorDto = {
  summary: {
    axBatches: 1,
    axRecords: 10,
    importsProcessing: 0,
    importsFailed: 1,
    importsConfirmed: 0,
    importRowsApplied: 0,
    aiGenerations: 0,
  },
  executions: [
    {
      id: 'ax-id',
      system: 'ax',
      operation: 'Recepción PUSH',
      status: 'received',
      records: 10,
      succeededRecords: null,
      failedRecords: null,
      startedAt: '2026-11-16T10:00:00.000Z',
      finishedAt: '2026-11-16T10:00:00.000Z',
      durationMs: null,
      actor: 'Sismetic',
      correlationId: 'ax-correlation',
      error: null,
    },
    {
      id: 'import-id',
      system: 'import',
      operation: 'Importación atributos',
      status: 'failed',
      records: 2,
      succeededRecords: 0,
      failedRecords: 2,
      startedAt: '2026-11-16T09:00:00.000Z',
      finishedAt: '2026-11-16T09:00:02.000Z',
      durationMs: 2000,
      actor: 'admin',
      correlationId: 'import-correlation',
      error: 'Archivo inválido',
    },
  ],
};
afterEach(cleanup);
describe('IntegrationExecutionMonitor', () => {
  it('filters persisted runs and exports precisely the filtered rows', () => {
    render(<IntegrationExecutionMonitor data={data} axBatchIds={{ 'ax-id': 'LOTE AX/2' }} />);
    fireEvent.change(screen.getByLabelText('Integración'), { target: { value: 'import' } });
    expect(screen.queryByText('Recepción PUSH')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar ejecuciones visibles (CSV)' }));
    expect(exports.downloadCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [expect.arrayContaining(['Importación', 'import-id', 'Archivo inválido'])],
      }),
      'ejecuciones-visibles',
    );
    fireEvent.change(screen.getByLabelText('Estado de ejecución'), {
      target: { value: 'received' },
    });
    expect(screen.getByText('No hay ejecuciones que coincidan con los filtros.')).toBeVisible();
  });
  it('opens the selected durable AX batch using its external reference', () => {
    render(<IntegrationExecutionMonitor data={data} axBatchIds={{ 'ax-id': 'LOTE AX/2' }} />);
    const row = screen.getByText('Recepción PUSH').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Ver ejecución' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Detalle de ejecución' }));
    expect(drawer.getByText('ax-correlation')).toBeVisible();
    expect(drawer.getByRole('link', { name: 'Abrir lote' })).toHaveAttribute(
      'href',
      '/integrations?view=batches&axBatchId=LOTE%20AX%2F2',
    );
    expect(drawer.getByText('Sin procesamiento habilitado')).toBeVisible();
    expect(drawer.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument();
  });
});
