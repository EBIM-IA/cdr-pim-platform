import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogHome } from './catalog-home';
const mocks = vi.hoisted(() => ({ push: vi.fn(), settings: vi.fn() }));
vi.mock('@/lib/catalog-parameters-api', () => ({ listCatalogParameters: async () => [] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/catalog-search', () => ({ CatalogSearch: () => <div>Buscador</div> }));
vi.mock('@/lib/catalog-home-api', () => ({ catalogHomeSettings: mocks.settings }));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogCategories: async () => [
    {
      id: 'leaf',
      name: 'Rodamiento',
      slug: 'rodamiento',
      ancestors: [{ id: 'root', name: 'Rodamientos y afines', slug: 'rodamientos-y-afines' }],
    },
  ],
  fetchCatalogWorkbook: async () => ({ facets: { brands: ['SKF'] } }),
}));
beforeEach(() => {
  mocks.push.mockReset();
  mocks.settings
    .mockReset()
    .mockResolvedValue({ config: { brands: [], categories: [] }, version: 4 });
});
afterEach(cleanup);
describe('Catalog Home', () => {
  it('opens the actual ancestor category and preserves the two consultation entry points', async () => {
    render(<CatalogHome />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rodamientos y afines' }));
    expect(mocks.push).toHaveBeenCalledWith('/products?category=root');
    expect(screen.getByRole('link', { name: 'Ver todos los artículos →' })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(screen.queryByRole('button', { name: 'Configurar marcas' })).not.toBeInTheDocument();
  });
  it('saves administrator choices with the loaded version and retains them on reload', async () => {
    const view = render(<CatalogHome canConfigure />);
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar marcas' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'BOSCH' }));
    mocks.settings.mockImplementation(async (input) =>
      input
        ? { ...input, version: 5 }
        : {
            version: 5,
            config: {
              brands: [{ key: 'BOSCH', visible: false, image: null, text: '' }],
              categories: [],
            },
          },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inicio' }));
    await waitFor(() =>
      expect(mocks.settings).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 4,
          config: expect.objectContaining({
            brands: expect.arrayContaining([
              expect.objectContaining({ key: 'BOSCH', visible: false }),
            ]),
          }),
        }),
      ),
    );
    view.unmount();
    render(<CatalogHome />);
    await screen.findByRole('heading', { name: 'Repuestos Ganadores' });
    expect(
      screen.queryByRole('button', { name: 'Buscar productos BOSCH' }),
    ).not.toBeInTheDocument();
  });
});
