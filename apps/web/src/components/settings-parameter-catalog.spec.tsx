import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { listCatalogParameters, saveCatalogParameter } from '@/lib/catalog-parameters-api';
import { SettingsParameterCatalog } from './settings-parameter-catalog';
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchCatalogWorkbook: vi.fn() }));
vi.mock('@/lib/catalog-parameters-api', () => ({
  listCatalogParameters: vi.fn(),
  saveCatalogParameter: vi.fn(),
}));
const parameter = {
  id: 'a5290000-0000-4000-8000-000000000001',
  kind: 'synonym' as const,
  value: 'ruliman',
  target: 'rodamiento',
  description: '',
  logoDataUrl: null,
  active: true,
  version: 1,
  updatedAt: '2026-11-10T10:00:00Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchCatalogWorkbook).mockResolvedValue({
    columns: [],
    facets: { brands: [], applicationTypes: [], statuses: [] },
    items: [],
    total: 0,
    page: 1,
    pageSize: 1,
  });
  vi.mocked(listCatalogParameters).mockResolvedValue([parameter]);
  vi.mocked(saveCatalogParameter).mockResolvedValue(parameter);
});
afterEach(cleanup);
describe('catalog parameter maintenance', () => {
  it('loads configured synonyms and hides mutations for consultation roles', async () => {
    render(<SettingsParameterCatalog catalog="Sinónimos" />);
    expect(await screen.findByText('ruliman')).toBeInTheDocument();
    expect(screen.getByText('rodamiento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar parámetro' })).not.toBeInTheDocument();
  });
  it('saves synonym edits with the loaded version and retains a conflicting draft', async () => {
    vi.mocked(saveCatalogParameter).mockRejectedValue(
      new Error('Otra persona modificó el parámetro'),
    );
    render(<SettingsParameterCatalog catalog="Sinónimos" canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Buscar también'), { target: { value: 'cojinete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar parámetro' }));
    await waitFor(() =>
      expect(saveCatalogParameter).toHaveBeenCalledWith(
        expect.objectContaining({ id: parameter.id, expectedVersion: 1, target: 'cojinete' }),
      ),
    );
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.getByLabelText('Buscar también')).toHaveValue('cojinete');
  });
});
