import type { ProductVariantSearchDto } from '@cdr/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogSearch } from '@/components/catalog-search';
import { searchProductVariants } from '@/lib/product-experience-api';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/product-experience-api', () => ({ searchProductVariants: vi.fn() }));

function workbook(sku = '6205-SKF'): ProductVariantSearchDto {
  return {
    categories: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Rodamientos' }],
    brands: ['SKF'],
    totalProducts: 1,
    truncated: false,
    items: [
      {
        productId: '11111111-1111-4111-8111-111111111111',
        codigoArticulo: sku,
        nombreAmigable:
          'Rodamiento de bolas rígido Marca Skf Para alternador de Toyota Corolla 2014-2018',
        tipo: 'automotriz',
        marca: 'SKF',
        codigoProveedor: sku,
        codigoUnificador: 'UNI-6205',
        aplicacion: {
          id: '33333333-3333-4333-8333-333333333333',
          marcaVehiculo: 'Toyota',
          modelo: 'Corolla',
          tipo: '',
          combustible: '',
          traccion: '',
          cilindraje: '',
          anioDesde: 2014,
          anioHasta: 2018,
          area: '',
          subarea: 'Alternador',
          motor: '',
        },
        ficha: `/products/11111111-1111-4111-8111-111111111111?aplicacion=33333333-3333-4333-8333-333333333333`,
      },
    ],
  };
}

function SearchHarness({
  onSearch,
  showDescription = true,
}: {
  onSearch: Parameters<typeof CatalogSearch>[0]['onSearch'];
  showDescription?: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <CatalogSearch
      value={value}
      onChange={setValue}
      onSearch={onSearch}
      showDescription={showDescription}
    />
  );
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(searchProductVariants).mockReset().mockResolvedValue(workbook());
});
afterEach(cleanup);

async function search(query = '6205', onSearch = vi.fn(), showDescription = true) {
  render(<SearchHarness onSearch={onSearch} showDescription={showDescription} />);
  const input = screen.getByRole('combobox', { name: 'Buscar en el catálogo' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  await screen.findByRole('option', { name: /6205-SKF/u });
  return { input, onSearch };
}

describe('CatalogSearch', () => {
  it.each([
    { steps: 1, filter: undefined, query: '6205' },
    { steps: 2, filter: { categoryId: '22222222-2222-4222-8222-222222222222' }, query: '6205' },
    { steps: 3, filter: { brand: 'SKF' }, query: '6205' },
  ])(
    'selects query/category/brand/SKU suggestion with $steps arrow presses',
    async ({ steps, filter, query }) => {
      const { input, onSearch } = await search();
      for (let index = 0; index < steps; index += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
      const selectedId = input.getAttribute('aria-activedescendant');
      expect(selectedId).toBeTruthy();
      expect(document.getElementById(selectedId!)).toHaveAttribute('aria-selected', 'true');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onSearch).toHaveBeenCalledWith(query, filter);
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    },
  );

  it('moves upward from the input to the final suggestion and keeps options out of the Tab sequence', async () => {
    const { input, onSearch } = await search();
    const options = screen.getAllByRole('option');
    for (const option of options) expect(option).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith(workbook().items[0]!.ficha);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('shows friendly names and the selected vehicle to sales profiles', async () => {
    const { input } = await search('6205', vi.fn(), false);
    expect(screen.getByRole('option', { name: /6205-SKF · SKF/u })).toBeInTheDocument();
    expect(screen.getByText(workbook().items[0]!.nombreAmigable)).toBeInTheDocument();
    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false);
    expect(input).toHaveValue('6205');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ignores an earlier response after a new query starts', async () => {
    let resolvePrevious!: (value: ProductVariantSearchDto) => void;
    vi.mocked(searchProductVariants)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePrevious = resolve;
          }),
      )
      .mockResolvedValueOnce(workbook('6206-SKF'));
    render(<SearchHarness onSearch={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Buscar en el catálogo' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6205' } });
    await waitFor(() => expect(searchProductVariants).toHaveBeenCalledTimes(1));
    const previousSignal = vi.mocked(searchProductVariants).mock.calls[0]![1]!;
    fireEvent.change(input, { target: { value: '6206' } });
    expect(previousSignal.aborted).toBe(true);
    expect(await screen.findByRole('option', { name: /6206-SKF/u })).toBeInTheDocument();
    await act(async () => resolvePrevious(workbook('6205-SKF')));
    expect(screen.queryByRole('option', { name: /6205-SKF/u })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /6206-SKF/u })).toBeInTheDocument();
  });

  it('reopens the same query without retaining a removed active suggestion', async () => {
    const { input } = await search();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Escape' });
    vi.mocked(searchProductVariants).mockResolvedValue({
      ...workbook(),
      items: [],
      categories: [],
      brands: [],
      totalProducts: 0,
    });
    fireEvent.focus(input);
    await waitFor(() => expect(searchProductVariants).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    const activeId = input.getAttribute('aria-activedescendant');
    if (activeId) expect(document.getElementById(activeId)).not.toBeNull();
    expect(screen.getByRole('option', { name: /Buscar «6205»/u })).toBeVisible();
  });
});
