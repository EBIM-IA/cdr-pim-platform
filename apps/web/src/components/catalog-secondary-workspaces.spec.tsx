import type { GroupApplicationDto, WorkspaceDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationsWorkspace } from '@/components/applications-workspace';
import { EquivalencesWorkspace } from '@/components/equivalences-workspace';

const mocks = vi.hoisted(() => ({
  listApplications: vi.fn(),
  updateApplication: vi.fn(),
  listHomologs: vi.fn(),
}));

vi.mock('@/lib/operational-api', () => ({
  listApplications: mocks.listApplications,
  createApplication: vi.fn(),
  updateApplication: mocks.updateApplication,
  deactivateApplication: vi.fn(),
  listHomologs: mocks.listHomologs,
  createHomolog: vi.fn(),
  updateHomolog: vi.fn(),
  deactivateHomolog: vi.fn(),
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
  yearFrom: 2015,
  yearTo: 2020,
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
  yearFrom: 2012,
  yearTo: 2018,
};

afterEach(cleanup);

beforeEach(() => {
  mocks.listApplications.mockResolvedValue([application, secondApplication]);
  mocks.updateApplication.mockResolvedValue(application);
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
  window.history.replaceState({}, '', '/');
});

describe('catálogo secundario aprobado', () => {
  it('presenta aplicaciones por código unificador y filtros reales', async () => {
    render(<ApplicationsWorkspace canWrite />);

    expect(await screen.findAllByText('UNI-6205')).not.toHaveLength(0);
    expect(screen.getByText('Aplicaciones heredadas')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Todas las aplicaciones/ }));
    expect(screen.getByLabelText('Tipo')).toBeVisible();
    expect(screen.getByLabelText('Marca / industria')).toBeVisible();
  });

  it('edita una celda de aplicación contra el backend', async () => {
    render(<ApplicationsWorkspace canWrite />);

    await screen.findAllByText('UNI-6205');
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar Marca de UNI-6205' })[0]!);
    const input = screen.getByRole('textbox', { name: 'Editar Marca' });
    fireEvent.change(input, { target: { value: 'Lexus' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.updateApplication).toHaveBeenCalledWith('app-1', {
        expectedUpdatedAt: application.updatedAt,
        make: 'Lexus',
      }),
    );
  });

  it('combina el autofiltro de Aplicaciones con la vista y exporta solo las filas visibles', async () => {
    render(<ApplicationsWorkspace canWrite={false} />);

    await screen.findAllByText('UNI-6205');
    fireEvent.click(screen.getByRole('button', { name: /^Marca: filtrar u ordenar/u }));
    const dialog = screen.getByRole('dialog', { name: 'Filtrar Marca' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Seleccionar todo/u }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Toyota/u }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(screen.getByRole('status')).toHaveTextContent('1 de 2 filas visibles');
    expect(screen.getByRole('button', { name: /CSV · 1 fila$/u })).toBeEnabled();
    expect(screen.getAllByText('Toyota').some((element) => element.tagName === 'TD')).toBe(true);
    expect(screen.queryAllByText('Ford').some((element) => element.tagName === 'TD')).toBe(false);
  });

  it('filtra los grupos persistidos de Equivalencias y alinea la exportación con el orden visible', async () => {
    render(<EquivalencesWorkspace canWrite={false} />);
    await waitFor(() => expect(mocks.listHomologs).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /^Tipo: filtrar u ordenar/u }));
    const dialog = screen.getByRole('dialog', { name: 'Filtrar Tipo' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Seleccionar todo/u }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^ERP/u }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(screen.getByRole('status')).toHaveTextContent('1 de 2 filas visibles');
    expect(screen.getByRole('button', { name: /CSV · 1 fila$/u })).toBeEnabled();
    expect(screen.getByText('Rodamiento 6205')).toBeVisible();
    expect(screen.queryByText('Rodamiento 6305')).not.toBeInTheDocument();
  });

  it('construye identificadores solo con grupo, membresías y homólogos persistidos', async () => {
    render(<EquivalencesWorkspace canWrite={false} />);
    await waitFor(() => expect(mocks.listHomologs).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Identificadores/ }));

    expect(screen.getByText('Identificadores del grupo · UNI-6205')).toBeVisible();
    expect(screen.getByText('SKU-6205-A')).toBeVisible();
    expect(screen.getByText('EXT-6205')).toBeVisible();
    expect(screen.queryByText('EAN simulado')).not.toBeInTheDocument();
  });
});
