import type { GroupApplicationDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listApplications, updateApplication } from '@/lib/operational-api';
import { downloadXlsx } from '@/lib/tabular-export';

import { ApplicationsWorkspace } from './applications-workspace';

vi.mock('@/lib/operational-api', () => ({
  listApplications: vi.fn(),
  updateApplication: vi.fn(),
  createApplication: vi.fn(),
  deactivateApplication: vi.fn(),
}));
vi.mock('@/lib/tabular-export', () => ({ downloadXlsx: vi.fn(), downloadCsv: vi.fn() }));
const first: GroupApplicationDto = {
  id: 'application-1',
  groupId: 'group-1',
  unifiedCode: 'UNI-6205',
  vehicleType: 'AUTOMOTRIZ',
  make: 'TOYOTA',
  model: 'COROLLA',
  bodyStyle: 'SEDAN',
  fuel: 'GSL',
  traction: '4X2',
  displacement: '1.8L',
  yearFrom: 2014,
  yearTo: 2018,
  area: 'MOTOR',
  subarea: 'ADMISION',
  engine: '1.8',
  notes: null,
  active: true,
  source: 'manual',
  importBatchId: null,
  createdAt: '2026-10-23T10:00:00Z',
  updatedAt: '2026-10-23T10:00:00Z',
};
const second: GroupApplicationDto = {
  ...first,
  id: 'application-2',
  make: 'NISSAN',
  model: 'SENTRA',
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/applications');
  vi.mocked(listApplications).mockResolvedValue([first, second]);
  vi.mocked(updateApplication).mockResolvedValue({
    ...first,
    make: 'LEXUS',
    updatedAt: '2026-10-23T10:01:00Z',
  });
});
afterEach(cleanup);

describe('applications reference layout', () => {
  it('puts compact tabs and operations before the editable matrix without unrelated KPI cards', async () => {
    render(<ApplicationsWorkspace canWrite />);
    const table = await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /Todas las aplicaciones/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Agregar fila' })).toHaveTextContent('Nuevo');
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeVisible();
    expect(screen.queryByLabelText('Resumen')).not.toBeInTheDocument();
    const headings = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headings[1]).toContain('Código Unificador');
    expect(headings[2]).toContain('Marca Vehículo');
    expect(headings[3]).toContain('Modelo');
    expect(screen.getByText(/Clic en una celda o empieza a escribir/)).toBeInTheDocument();
  });

  it('combines column filtering with export and preserves the current visible column order', async () => {
    render(<ApplicationsWorkspace canWrite />);
    await screen.findByRole('table');
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Editar Marca Vehículo de UNI-6205' }),
      ).toHaveLength(2),
    );
    fireEvent.change(screen.getByLabelText('Filtro de columna Marca Vehículo'), {
      target: { value: 'TOYOTA' },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Editar Marca Vehículo de UNI-6205' }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    const exported = vi.mocked(downloadXlsx).mock.calls[0]![0];
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0]).toContain('TOYOTA');
    expect(exported.rows[0]).not.toContain('NISSAN');
  });

  it('keeps inline updates persistent and disables import/selection for a read-only role', async () => {
    const { unmount } = render(<ApplicationsWorkspace canWrite />);
    await screen.findByRole('table');
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar Marca Vehículo de UNI-6205' })[0]!,
    );
    const input = screen.getByRole('textbox', { name: 'Editar Marca Vehículo' });
    fireEvent.change(input, { target: { value: 'LEXUS' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(updateApplication).toHaveBeenCalledWith(first.id, {
        make: 'LEXUS',
        expectedUpdatedAt: first.updatedAt,
      }),
    );
    unmount();
    render(<ApplicationsWorkspace canWrite={false} />);
    expect(await screen.findByRole('button', { name: 'Importar' })).toBeDisabled();
    expect(await screen.findByLabelText('Seleccionar aplicación TOYOTA COROLLA')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Agregar fila' })).not.toBeInTheDocument();
  });
});
