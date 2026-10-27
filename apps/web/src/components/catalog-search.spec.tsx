import type { CatalogWorkbookResultDto } from '@cdr/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogSearch } from '@/components/catalog-search';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';

vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchCatalogWorkbook: vi.fn() }));

function workbook(sku = '6205-SKF'): CatalogWorkbookResultDto {
  return {
    columns: [],
    facets: { brands: ['SKF'], applicationTypes: ['INDUSTRIAL'], statuses: ['published'] },
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        sku,
        name: 'Descripción técnica del rodamiento',
        description: null,
        brand: 'SKF',
        category: { id: '22222222-2222-4222-8222-222222222222', name: 'Rodamientos' },
        template: null,
        applicationTypes: ['INDUSTRIAL'],
        status: 'published',
        completeness: 100,
        providerCode: null,
        unifiedCode: 'UNI-6205',
        updatedAt: '2026-10-27T10:00:00.000Z',
        attributes: {},
      },
    ],
    total: 1,
    page: 1,
    pageSize: 6,
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
  vi.mocked(fetchCatalogWorkbook).mockReset().mockResolvedValue(workbook());
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
    { steps: 4, filter: undefined, query: '6205-SKF' },
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
    expect(onSearch).toHaveBeenCalledWith('6205-SKF', undefined);
  });

  it('hides technical names in sales suggestions while retaining SKU and brand', async () => {
    const { input } = await search('6205', vi.fn(), false);
    expect(screen.getByRole('option', { name: /6205-SKF\s*SKF/u })).toBeInTheDocument();
    expect(screen.queryByText('Descripción técnica del rodamiento')).not.toBeInTheDocument();
    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false);
    expect(input).toHaveValue('6205');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ignores an earlier response after a new query starts', async () => {
    let resolvePrevious!: (value: CatalogWorkbookResultDto) => void;
    vi.mocked(fetchCatalogWorkbook)
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
    await waitFor(() => expect(fetchCatalogWorkbook).toHaveBeenCalledTimes(1));
    const previousSignal = vi.mocked(fetchCatalogWorkbook).mock.calls[0]![1]!;
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
    vi.mocked(fetchCatalogWorkbook).mockResolvedValue({ ...workbook(), items: [], total: 0 });
    fireEvent.focus(input);
    await waitFor(() => expect(fetchCatalogWorkbook).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    const activeId = input.getAttribute('aria-activedescendant');
    if (activeId) expect(document.getElementById(activeId)).not.toBeNull();
    expect(screen.getByRole('option', { name: /Buscar «6205»/u })).toBeVisible();
  });
});
