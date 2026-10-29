import type { GroupApplicationDto, WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationsWorkspace } from '@/components/applications-workspace';

const mocks = vi.hoisted(() => ({
  listApplications: vi.fn(),
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deactivateApplication: vi.fn(),
  listHomologs: vi.fn(),
  createHomolog: vi.fn(),
  updateHomolog: vi.fn(),
  deactivateHomolog: vi.fn(),
}));

vi.mock('@/lib/operational-api', () => ({
  listApplications: mocks.listApplications,
  createApplication: mocks.createApplication,
  updateApplication: mocks.updateApplication,
  deactivateApplication: mocks.deactivateApplication,
  listHomologs: mocks.listHomologs,
  createHomolog: mocks.createHomolog,
  updateHomolog: mocks.updateHomolog,
  deactivateHomolog: mocks.deactivateHomolog,
  listOemCodes: vi.fn().mockResolvedValue([]),
  createOemCode: vi.fn(),
  updateOemCode: vi.fn(),
  deactivateOemCode: vi.fn(),
  searchEligibleOemCodes: vi.fn(),
  searchEligibleHomologs: vi.fn(),
}));

const equivalencesWorkspace: WorkspaceDto = {
  slug: 'equivalences',
  operationalStatus: 'partial',
  generatedAt: '2026-10-05T12:00:00.000Z',
  metrics: [
    { key: 'groups', label: 'Grupos persistidos', value: 1, format: 'integer' },
    { key: 'memberships', label: 'Membresías', value: 2, format: 'integer' },
  ],
  columns: [
    { key: 'code', label: 'Código unificador', type: 'text' },
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'kind', label: 'Tipo', type: 'status' },
    { key: 'members', label: 'Miembros', type: 'number' },
    { key: 'skus', label: 'SKU', type: 'text' },
  ],
  rows: [
    {
      id: 'group-1',
      values: {
        code: 'UNI-6205',
        name: 'Rodamiento 6205',
        kind: 'ERP',
        members: 2,
        skus: 'SKU-6205-A, SKU-6205-B',
      },
    },
    {
      id: 'group-2',
      values: {
        code: 'UNI-6305',
        name: 'Rodamiento 6305',
        kind: 'Manual',
        members: 1,
        skus: 'SKU-6305-A',
      },
    },
  ],
  totalRows: 2,
  notices: [],
  actions: [],
};

vi.mock('@/components/use-workspace-data', () => ({
  useWorkspaceData: () => ({
    workspace: equivalencesWorkspace,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const application: GroupApplicationDto = {
  id: 'app-1',
  groupId: 'group-1',
  unifiedCode: 'UNI-6205',
  vehicleType: 'AUTOMOTRIZ',
  make: 'Toyota',
  model: 'Corolla',
  bodyStyle: 'SEDAN',
  fuel: 'GSL',
  traction: '4X2',
  displacement: '1.8L',
  yearFrom: 2015,
  yearTo: 2020,
  area: 'MOTOR',
  subarea: 'ADMISIÓN',
  engine: '1.8',
  notes: null,
  active: true,
  source: 'manual',
  importBatchId: null,
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-05T12:00:00.000Z',
};

const secondApplication: GroupApplicationDto = {
  ...application,
  id: 'app-2',
  make: 'Ford',
  model: 'Fiesta',
  bodyStyle: 'HB',
  fuel: 'GASOLINA',
  area: 'RUEDA',
  yearFrom: 2012,
  yearTo: 2018,
};

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  mocks.listApplications.mockResolvedValue([application, secondApplication]);
  mocks.updateApplication.mockResolvedValue(application);
  mocks.createApplication.mockResolvedValue({
    ...application,
    id: 'app-3',
    model: 'Yaris',
  });
  mocks.deactivateApplication.mockResolvedValue({ ...application, active: false });
  mocks.listHomologs.mockResolvedValue([
    {
      id: 'hom-1',
      groupId: 'group-1',
      unifiedCode: 'UNI-6205',
      externalCode: 'EXT-6205',
      externalBrand: 'FAG',
      approvalStatus: 'approved',
      active: true,
      source: 'manual',
      importBatchId: null,
      createdAt: '2026-10-05T12:00:00.000Z',
      updatedAt: '2026-10-05T12:00:00.000Z',
    },
  ]);
  mocks.createHomolog.mockResolvedValue({
    id: 'hom-2',
    groupId: 'group-1',
    unifiedCode: 'UNI-6205',
    externalCode: 'EXT-NEW',
    externalBrand: 'SKF',
    approvalStatus: 'pending',
    active: true,
    source: 'manual',
    importBatchId: null,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  });
  mocks.deactivateHomolog.mockResolvedValue({
    id: 'hom-1',
    groupId: 'group-1',
    unifiedCode: 'UNI-6205',
    externalCode: 'EXT-6205',
    externalBrand: 'FAG',
    approvalStatus: 'approved',
    active: false,
    source: 'manual',
    importBatchId: null,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:01:00.000Z',
  });
  window.history.replaceState({}, '', '/');
});

describe('catálogo secundario aprobado', () => {
  it('reordena las columnas de aplicaciones con controles accesibles y persiste la preferencia', async () => {
    render(<ApplicationsWorkspace canWrite={false} />);

    await screen.findAllByText('UNI-6205');
    fireEvent.click(
      screen.getByRole('button', { name: 'Mover columna Marca Vehículo a la izquierda' }),
    );

    const headings = screen.getAllByRole('columnheader').map((heading) => heading.textContent);
    expect(headings.findIndex((text) => text?.includes('Marca'))).toBeLessThan(
      headings.findIndex((text) => text?.includes('Código Unificador')),
    );
    expect(window.localStorage.getItem('cdr:column-order:guest:applications')).toContain(
      '"make","unifiedCode"',
    );
    expect(screen.getByRole('button', { name: 'Restaurar columnas' })).toBeEnabled();
  });

  it('presenta aplicaciones por código unificador y filtros reales', async () => {
    render(<ApplicationsWorkspace canWrite />);

    expect(await screen.findAllByText('UNI-6205')).not.toHaveLength(0);
    expect(screen.getByRole('heading', { name: /Todas las aplicaciones/ })).toBeVisible();
    expect(screen.queryByText('Código unificador en contexto')).not.toBeInTheDocument();
    expect(screen.queryByText('Aplicaciones heredadas')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filtro de columna Tipo')).toBeVisible();
    expect(screen.getByLabelText('Filtro de columna Marca Vehículo')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Buscar aplicaciones'), {
      target: { value: 'SEDAN' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(screen.getByLabelText('Seleccionar aplicación Toyota Corolla')).toBeVisible();
    expect(screen.queryByLabelText('Seleccionar aplicación Ford Fiesta')).not.toBeInTheDocument();
  });

  it('edita una celda de aplicación contra el backend', async () => {
    render(<ApplicationsWorkspace canWrite />);

    await screen.findAllByText('UNI-6205');
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar Marca Vehículo de UNI-6205' })[0]!,
    );
    const input = screen.getByRole('textbox', { name: 'Editar Marca Vehículo' });
    fireEvent.change(input, { target: { value: 'Lexus' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.updateApplication).toHaveBeenCalledWith('app-1', {
        expectedUpdatedAt: application.updatedAt,
        make: 'Lexus',
      }),
    );
  });

  it('edita inline los campos explícitos de la aplicación PIM', async () => {
    render(<ApplicationsWorkspace canWrite />);

    await screen.findAllByText('UNI-6205');
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar Tipo de UNI-6205' })[0]!);
    const input = screen.getByRole('textbox', { name: 'Editar Tipo' });
    fireEvent.change(input, { target: { value: 'SUV' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.updateApplication).toHaveBeenCalledWith('app-1', {
        expectedUpdatedAt: application.updatedAt,
        bodyStyle: 'SUV',
      }),
    );
  });

  it('crea una aplicación como fila inline y desactiva una selección', async () => {
    render(<ApplicationsWorkspace canWrite />);

    await screen.findAllByText('UNI-6205');
    fireEvent.click(screen.getByRole('button', { name: /Agregar fila/u }));
    fireEvent.change(screen.getByLabelText('Nuevo código unificador de aplicación'), {
      target: { value: 'UNI-6205' },
    });
    fireEvent.change(screen.getByLabelText('Nueva marca de aplicación'), {
      target: { value: 'Toyota' },
    });
    fireEvent.change(screen.getByLabelText('Nuevo modelo de aplicación'), {
      target: { value: 'Yaris' },
    });
    fireEvent.change(screen.getByLabelText('Nuevo contexto de aplicación'), {
      target: { value: 'AUTOMOTRIZ' },
    });
    fireEvent.change(screen.getByLabelText('Nuevo tipo de carrocería'), {
      target: { value: 'SEDAN' },
    });
    fireEvent.change(screen.getByLabelText('Nuevo combustible'), {
      target: { value: 'GSL' },
    });
    fireEvent.change(screen.getByLabelText('Nueva tracción'), { target: { value: '4X2' } });
    fireEvent.change(screen.getByLabelText('Nuevo cilindraje'), { target: { value: '1.5L' } });
    fireEvent.change(screen.getByLabelText('Nueva área'), { target: { value: 'MOTOR' } });
    fireEvent.change(screen.getByLabelText('Nueva subárea'), {
      target: { value: 'ADMISIÓN' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva aplicación' }));

    await waitFor(() =>
      expect(mocks.createApplication).toHaveBeenCalledWith({
        unifiedCode: 'UNI-6205',
        vehicleType: 'AUTOMOTRIZ',
        make: 'Toyota',
        model: 'Yaris',
        bodyStyle: 'SEDAN',
        fuel: 'GSL',
        traction: '4X2',
        displacement: '1.5L',
        yearFrom: undefined,
        yearTo: undefined,
        area: 'MOTOR',
        subarea: 'ADMISIÓN',
        engine: '',
        notes: '',
      }),
    );

    fireEvent.click(screen.getByLabelText('Seleccionar aplicación Toyota Corolla'));
    fireEvent.click(screen.getByRole('button', { name: /Eliminar selección \(1\)/u }));
    await waitFor(() =>
      expect(mocks.deactivateApplication).toHaveBeenCalledWith('app-1', '2026-10-05T12:00:00.000Z'),
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Seleccionar aplicación Toyota Corolla'),
      ).not.toBeInTheDocument(),
    );
  });

  it('combina el autofiltro de Aplicaciones con la vista y exporta solo las filas visibles', async () => {
    render(<ApplicationsWorkspace canWrite={false} />);

    await screen.findAllByText('UNI-6205');
    fireEvent.click(screen.getByRole('button', { name: /^Marca Vehículo: filtrar u ordenar/u }));
    const dialog = screen.getByRole('dialog', { name: 'Filtrar Marca Vehículo' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Seleccionar todo/u }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Toyota/u }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(screen.getByRole('status')).toHaveTextContent('1 de 2 filas visibles');
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
    expect(screen.getAllByText('Toyota').some((element) => element.tagName === 'TD')).toBe(true);
    expect(screen.queryAllByText('Ford').some((element) => element.tagName === 'TD')).toBe(false);
  });
});
