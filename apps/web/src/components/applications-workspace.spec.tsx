import type { GroupApplicationDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listApplications, updateApplication } from '@/lib/operational-api';
import { downloadXlsx } from '@/lib/tabular-export';
import { findApplicationUnifiedCodes } from '@/lib/application-search';
import type * as ApplicationSearch from '@/lib/application-search';

import { ApplicationsWorkspace } from './applications-workspace';

vi.mock('@/lib/operational-api', () => ({
  listApplications: vi.fn(),
  updateApplication: vi.fn(),
  createApplication: vi.fn(),
  deactivateApplication: vi.fn(),
}));
vi.mock('@/lib/tabular-export', () => ({ downloadXlsx: vi.fn(), downloadCsv: vi.fn() }));
vi.mock('@/lib/application-search', async (original) => ({
  ...(await original<typeof ApplicationSearch>()),
  findApplicationUnifiedCodes: vi.fn(),
}));
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
  vi.mocked(findApplicationUnifiedCodes).mockResolvedValue(new Set());
  vi.mocked(updateApplication).mockResolvedValue({
    ...first,
    make: 'LEXUS',
    updatedAt: '2026-10-23T10:01:00Z',
  });
});
afterEach(cleanup);

describe('applications reference layout', () => {
  it('puts one compact table and operations before the editable matrix without contextual tabs', async () => {
    render(<ApplicationsWorkspace canWrite />);
    const table = await screen.findByRole('table');
    expect(screen.getByRole('heading', { name: /Todas las aplicaciones/ })).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Vistas de aplicaciones' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Código unificador en contexto')).not.toBeInTheDocument();
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

  it('keeps URL group context as a removable table filter, with a return to the real product sheet', async () => {
    window.history.replaceState(
      {},
      '',
      '/applications?view=context&unifiedCode=UNI-6205&productId=product-1',
    );
    vi.mocked(listApplications).mockResolvedValue([first, { ...second, unifiedCode: 'UNI-OTHER' }]);
    render(<ApplicationsWorkspace canWrite />);
    await screen.findByRole('table');
    expect(screen.getByText('TOYOTA')).toBeVisible();
    expect(screen.queryByText('NISSAN')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a ficha' })).toHaveAttribute(
      'href',
      '/products/product-1?tab=applications',
    );
    expect(screen.queryByLabelText('Código unificador')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(vi.mocked(downloadXlsx).mock.calls[0]![0].rows).toHaveLength(1);
    expect(vi.mocked(downloadXlsx).mock.calls[0]![1]).toBe('aplicaciones-UNI-6205');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila' }));
    expect(screen.getByLabelText('Nuevo código unificador de aplicación')).toHaveValue('UNI-6205');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar nueva aplicación' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Quitar filtro de código unificador UNI-6205' }),
    );
    expect(screen.getByText('NISSAN')).toBeVisible();
    expect(window.location.search).toBe('?productId=product-1');
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

  it('keeps inline updates persistent and removes write and upload-template controls for a read-only role', async () => {
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
    expect(await screen.findByLabelText('Seleccionar aplicación TOYOTA COROLLA')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plantilla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar fila' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
  });

  it('combines vehicle terms across columns and clears its active search without a catalog lookup', async () => {
    render(<ApplicationsWorkspace canWrite={false} />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar aplicaciones' }), {
      target: { value: 'toyota corolla 2014' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(screen.getByText('TOYOTA')).toBeVisible();
    expect(screen.queryByText('NISSAN')).not.toBeInTheDocument();
    expect(findApplicationUnifiedCodes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar búsqueda toyota corolla 2014' }));
    expect(screen.getByText('NISSAN')).toBeVisible();
  });

  it('finds applications through real product unified codes when the query is a SKU', async () => {
    vi.mocked(listApplications).mockResolvedValue([first, { ...second, unifiedCode: 'UNI-OTHER' }]);
    vi.mocked(findApplicationUnifiedCodes).mockResolvedValue(new Set(['UNI-6205']));
    render(<ApplicationsWorkspace canWrite={false} />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar aplicaciones' }), {
      target: { value: '6205-2RS1 SKF' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(findApplicationUnifiedCodes).toHaveBeenCalledWith(
        '6205-2RS1 SKF',
        ['UNI-6205', 'UNI-OTHER'],
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText('TOYOTA')).toBeVisible();
    expect(screen.queryByText('NISSAN')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(vi.mocked(downloadXlsx).mock.calls[0]![0].rows).toHaveLength(1);
  });

  it('reports an incomplete product lookup as an error and allows retry without exporting partial rows', async () => {
    vi.mocked(findApplicationUnifiedCodes)
      .mockRejectedValueOnce(new Error('La consulta del catálogo falló.'))
      .mockResolvedValueOnce(new Set(['UNI-6205']));
    render(<ApplicationsWorkspace canWrite={false} />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar aplicaciones' }), {
      target: { value: 'SKU-SKF' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(
      await screen.findByRole('heading', { name: 'No pudimos completar la búsqueda' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Sin aplicaciones' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }));
    expect(await screen.findByText('TOYOTA')).toBeVisible();
  });
});
