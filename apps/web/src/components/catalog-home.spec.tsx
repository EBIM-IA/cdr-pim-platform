import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogHome } from './catalog-home';
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  settings: vi.fn(),
  categories: vi.fn(),
  adminCategories: vi.fn(),
}));
vi.mock('@/lib/catalog-admin-api', () => ({ listAdminCategories: mocks.adminCategories }));
vi.mock('@/lib/catalog-parameters-api', () => ({ listCatalogParameters: async () => [] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/catalog-search', () => ({ CatalogSearch: () => <div>Buscador</div> }));
vi.mock('@/lib/catalog-home-api', () => ({ catalogHomeSettings: mocks.settings }));
vi.mock('@/lib/dynamic-catalog-api', () => ({
  fetchCatalogCategories: mocks.categories,
  fetchCatalogWorkbook: async () => ({ facets: { brands: ['SKF'] } }),
}));
beforeEach(() => {
  mocks.push.mockReset();
  mocks.adminCategories.mockReset().mockResolvedValue([]);
  mocks.categories.mockReset().mockResolvedValue([
    {
      id: 'leaf',
      name: 'Rodamiento',
      slug: 'rodamiento',
      ancestors: [{ id: 'root', name: 'Rodamientos y afines', slug: 'rodamientos-y-afines' }],
    },
  ]);
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
  it('shows only populated authorized roots in the carousel and retains empty roots in configuration', async () => {
    mocks.categories.mockResolvedValue([
      {
        id: 'used-leaf',
        name: 'Con artículos',
        slug: 'used',
        skuCount: 2,
        ancestors: [{ id: 'root-used', name: 'Con artículos', slug: 'root-used' }],
      },
      {
        id: 'empty-leaf',
        name: 'Sin artículos',
        slug: 'empty',
        skuCount: 0,
        ancestors: [{ id: 'root-empty', name: 'Sin artículos', slug: 'root-empty' }],
      },
    ]);
    render(<CatalogHome canConfigure />);
    expect(await screen.findByRole('button', { name: 'Con artículos' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sin artículos' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar categorías' }));
    expect(screen.getByText('Sin artículos')).toBeVisible();
  });

  it('lets the administrator configure a new root before it has a template or SKU', async () => {
    mocks.categories.mockResolvedValue([]);
    mocks.adminCategories.mockResolvedValue([
      { id: 'new-root', parentId: null, name: 'Nueva categoría', slug: 'nueva' },
    ]);
    render(<CatalogHome canConfigure />);
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar categorías' }));
    expect(screen.getByText('Nueva categoría')).toBeVisible();
    expect(screen.getByLabelText('Texto de Nueva categoría')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nueva categoría' })).not.toBeInTheDocument();
  });

  it('counts enabled brands without an image in the editor', async () => {
    mocks.settings.mockResolvedValue({
      config: { brands: [{ key: 'SKF', visible: true, image: null, position: 0 }], categories: [] },
      version: 4,
    });
    render(<CatalogHome canConfigure />);
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar marcas' }));
    expect(await screen.findByText(/1 marcas activadas sin imagen/)).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'SKF' }));
    expect(screen.queryByText(/marcas activadas sin imagen/)).not.toBeInTheDocument();
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
