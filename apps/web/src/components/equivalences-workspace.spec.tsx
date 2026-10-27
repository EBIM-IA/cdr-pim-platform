import type {
  CatalogWorkbookProductDto,
  ExternalHomologDto,
  GroupOemCodeDto,
} from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EquivalencesWorkspace } from './equivalences-workspace';

const mocks = vi.hoisted(() => ({
  fetchCatalogWorkbook: vi.fn(),
  fetchCatalogCategories: vi.fn(),
  listHomologs: vi.fn(),
  listOemCodes: vi.fn(),
  createHomolog: vi.fn(),
  createOemCode: vi.fn(),
  updateHomolog: vi.fn(),
  updateOemCode: vi.fn(),
  deactivateHomolog: vi.fn(),
  deactivateOemCode: vi.fn(),
  downloadXlsx: vi.fn(),
}));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogWorkbook: mocks.fetchCatalogWorkbook,
  fetchCatalogCategories: mocks.fetchCatalogCategories,
}));
vi.mock('@/lib/operational-api', () => mocks);
vi.mock('@/lib/tabular-export', () => ({ downloadXlsx: mocks.downloadXlsx }));
vi.mock('next/navigation', () => ({ usePathname: () => '/equivalences' }));
const one: CatalogWorkbookProductDto = {
  id: '11111111-1111-4111-8111-111111111111',
  sku: 'SKU-6205-A',
  name: 'Rodamiento 6205',
  description: 'Descripción',
  brand: 'SKF',
  status: 'published',
  updatedAt: '2026-10-23T00:00:00.000Z',
  category: { id: '22222222-2222-4222-8222-222222222222', name: 'Rodamientos' },
  template: {
    id: '33333333-3333-4333-8333-333333333333',
    variantKey: '1',
    name: 'Rígidos',
    version: 1,
  },
  providerCode: 'PROV-1',
  unifiedCode: 'UNI-6205',
  applicationTypes: ['INDUSTRIAL'],
  completeness: 80,
  attributes: {},
};
const two: CatalogWorkbookProductDto = {
  ...one,
  id: '44444444-4444-4444-8444-444444444444',
  sku: 'SKU-6205-B',
  brand: 'FAG',
  status: 'draft',
  completeness: 60,
};
const third: CatalogWorkbookProductDto = {
  ...one,
  id: '55555555-5555-4555-8555-555555555555',
  sku: 'SKU-6305',
  unifiedCode: 'UNI-6305',
  name: 'Rodamiento 6305',
};
const homolog: ExternalHomologDto = {
  id: '66666666-6666-4666-8666-666666666666',
  groupId: '77777777-7777-4777-8777-777777777777',
  unifiedCode: 'UNI-6205',
  externalCode: 'EXT-6205',
  externalBrand: 'NSK',
  active: true,
  approvalStatus: 'approved',
  source: 'manual',
  importBatchId: null,
  createdAt: '2026-10-23T00:00:00.000Z',
  updatedAt: '2026-10-23T00:00:00.000Z',
};
const oem: GroupOemCodeDto = {
  id: '88888888-8888-4888-8888-888888888888',
  groupId: homolog.groupId,
  unifiedCode: 'UNI-6205',
  oemCode: 'OEM-001',
  brands: ['TOYOTA', 'LEXUS'],
  active: true,
  approvalStatus: 'approved',
  source: 'import',
  importBatchId: null,
  createdAt: homolog.createdAt,
  updatedAt: homolog.updatedAt,
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/equivalences');
  mocks.fetchCatalogWorkbook.mockResolvedValue({
    items: [one, two, third],
    columns: [],
    total: 3,
    page: 1,
    pageSize: 100,
    facets: { brands: [], applicationTypes: [], statuses: [] },
  });
  mocks.fetchCatalogCategories.mockResolvedValue([
    {
      id: one.category!.id,
      name: 'Rodamientos',
      path: 'Repuestos / Rodamientos / Rígidos',
      templateId: one.template!.id,
    },
  ]);
  mocks.listHomologs.mockResolvedValue([homolog]);
  mocks.listOemCodes.mockResolvedValue([oem]);
  mocks.createHomolog.mockResolvedValue({
    ...homolog,
    id: '99999999-9999-4999-8999-999999999999',
    externalCode: 'EXT-NEW',
    approvalStatus: 'pending',
  });
  mocks.updateHomolog.mockResolvedValue({
    ...homolog,
    externalCode: 'EXT-EDIT',
    updatedAt: '2026-10-23T01:00:00.000Z',
  });
  mocks.deactivateHomolog.mockResolvedValue({ ...homolog, active: false });
});
afterEach(cleanup);
async function loaded() {
  await screen.findByRole('region', { name: 'Asignaciones de códigos unificadores' });
}
describe('designer equivalence screens', () => {
  it('renders one assignment per SKU with hierarchy, real counts and a single compact toolbar', async () => {
    render(<EquivalencesWorkspace canWrite />);
    await loaded();
    const table = screen.getByRole('region', { name: 'Asignaciones de códigos unificadores' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(
      within(table).getByRole('columnheader', { name: /Categoría tercer nivel/u }),
    ).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: /Sincronización AX/u })).toBeVisible();
    expect(within(table).getAllByText('Sin registro de sincronización')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Códigos unificadores 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Buscar códigos unificadores'), {
      target: { value: 'SKF 6205' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(mocks.downloadXlsx).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [expect.arrayContaining(['SKU-6205-A'])] }),
      'Códigos unificadores',
    );
  }, 10_000);
  it('opens a full group with independently addressable SKU, homologs and OEM and returns to the list', async () => {
    render(<EquivalencesWorkspace canWrite canViewCompleteness />);
    await loaded();
    fireEvent.click(screen.getAllByRole('button', { name: 'UNI-6205' })[0]!);
    expect(await screen.findByRole('region', { name: 'Resumen del grupo' })).toHaveTextContent(
      '70%',
    );
    expect(screen.getByRole('heading', { name: 'SKU equivalentes · 2' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Homólogos de UNI-6205 · 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Códigos OEM de UNI-6205 · 1' })).toBeVisible();
    expect(window.location.search).toContain('group=UNI-6205');
    expect(screen.getAllByRole('link', { name: 'Ver ficha' })[0]).toHaveAttribute(
      'href',
      `/products/${one.id}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Volver al listado' }));
    await loaded();
  });
  it('renders identifiers as their own SKU screen and keeps base ERP read-only', async () => {
    window.history.replaceState({}, '', '/equivalences?view=identifiers&sku=SKU-6205-A');
    render(<EquivalencesWorkspace canWrite />);
    expect(
      await screen.findByRole('heading', { name: 'Identificadores del SKU · 3' }),
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'SKU en contexto' })).toHaveValue('SKU-6205-A');
    expect(screen.getAllByText('Solo lectura · ERP')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Relacionados en tienda' })).toBeVisible();
    expect(screen.getByText('EXT-6205')).toBeVisible();
    expect(window.location.search).toContain('view=identifiers');
  });
  it('creates and edits a homolog against the real optimistic API and confirms logical deletion', async () => {
    render(<EquivalencesWorkspace canWrite />);
    await loaded();
    fireEvent.click(screen.getByRole('tab', { name: 'Homólogos 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila' }));
    fireEvent.change(screen.getByLabelText('Nuevo código unificador'), {
      target: { value: 'UNI-6205' },
    });
    fireEvent.change(screen.getByLabelText('Nuevo código externo'), {
      target: { value: 'EXT-NEW' },
    });
    fireEvent.change(screen.getByLabelText('Nueva marca externa'), { target: { value: 'NSK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nuevo homólogo' }));
    await waitFor(() =>
      expect(mocks.createHomolog).toHaveBeenCalledWith({
        unifiedCode: 'UNI-6205',
        externalCode: 'EXT-NEW',
        externalBrand: 'NSK',
        approvalStatus: 'pending',
        active: true,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar Código de EXT-6205' }));
    fireEvent.change(screen.getByLabelText('Editar Código'), { target: { value: 'EXT-EDIT' } });
    fireEvent.blur(screen.getByLabelText('Editar Código'));
    await waitFor(() =>
      expect(mocks.updateHomolog).toHaveBeenCalledWith(homolog.id, {
        expectedUpdatedAt: homolog.updatedAt,
        externalCode: 'EXT-EDIT',
      }),
    );
    fireEvent.click(await screen.findByLabelText('Seleccionar homólogo EXT-EDIT'));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar (1)' }));
    expect(mocks.deactivateHomolog).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
    await waitFor(() =>
      expect(mocks.deactivateHomolog).toHaveBeenCalledWith(homolog.id, '2026-10-23T01:00:00.000Z'),
    );
  });
  it('preserves a new row across tabs and does not expose write controls to readers', async () => {
    render(<EquivalencesWorkspace canWrite={false} canViewProductStatus={false} />);
    await loaded();
    expect(screen.queryByRole('columnheader', { name: /Estado SKU/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Descripción/u })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Homólogos 1' }));
    expect(screen.queryByRole('button', { name: 'Agregar fila' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plantilla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/u })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Seleccionar homólogo EXT-6205')).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'OEM 1' }));
    expect(screen.getByText('TOYOTA, LEXUS')).toBeVisible();
  });
  it('keeps unsaved new values when changing relation tables', async () => {
    render(<EquivalencesWorkspace canWrite />);
    await loaded();
    fireEvent.click(screen.getByRole('tab', { name: 'Homólogos 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila' }));
    fireEvent.change(screen.getByLabelText('Nuevo código externo'), {
      target: { value: 'DRAFT-CODE' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'OEM 1' }));
    expect(screen.getByText(/fila nueva sin completar/u)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la fila' }));
    expect(screen.getByLabelText('Nuevo código externo')).toHaveValue('DRAFT-CODE');
  });
  it('keeps column filters and sorting separate for Homologs and OEM and exports each visible set', async () => {
    mocks.listHomologs.mockResolvedValue([
      homolog,
      { ...homolog, id: '99999999-9999-4999-8999-999999999999', externalCode: 'ZZZ-NSK' },
      {
        ...homolog,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        externalCode: 'FAG-6205',
        externalBrand: 'FAG',
      },
    ]);
    mocks.listOemCodes.mockResolvedValue([
      oem,
      {
        ...oem,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        oemCode: 'A-OEM-002',
        brands: ['HONDA'],
      },
    ]);
    render(<EquivalencesWorkspace canWrite />);
    await loaded();
    fireEvent.click(screen.getByRole('tab', { name: 'Homólogos 3' }));
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Filtro de columna Marca homólogo *' }),
      {
        target: { value: 'NSK' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /^Código homólogo \*: filtrar/u }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Filtrar Código homólogo *' })).getByRole(
        'button',
        { name: /Z → A/u },
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(mocks.downloadXlsx).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rows: [expect.arrayContaining(['ZZZ-NSK']), expect.arrayContaining(['EXT-6205'])],
      }),
      'Homólogos',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'OEM 2' }));
    expect(screen.getByText('OEM-001')).toBeVisible();
    expect(screen.getByText('A-OEM-002')).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Filtro de columna Marca *' })).toHaveValue('');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtro de columna Marca *' }), {
      target: { value: 'HONDA' },
    });
    expect(screen.queryByText('OEM-001')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Código OEM \*: filtrar/u }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Filtrar Código OEM *' })).getByRole('button', {
        name: /A → Z/u,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(mocks.downloadXlsx).toHaveBeenLastCalledWith(
      expect.objectContaining({ rows: [expect.arrayContaining(['A-OEM-002'])] }),
      'Códigos OEM',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Homólogos 3' }));
    expect(screen.queryByText('FAG-6205')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(mocks.downloadXlsx).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rows: [expect.arrayContaining(['ZZZ-NSK']), expect.arrayContaining(['EXT-6205'])],
      }),
      'Homólogos',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'OEM 2' }));
    expect(screen.queryByText('OEM-001')).not.toBeInTheDocument();
    expect(screen.getByText('A-OEM-002')).toBeVisible();
  });
});
