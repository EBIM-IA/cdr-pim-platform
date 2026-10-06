import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProducts } from '@/lib/catalog-api';
import { searchEligibleHomologs } from '@/lib/operational-api';
import type { Product } from '@/lib/types';

import { SmartSearchWorkspace } from './smart-search-workspace';

vi.mock('@/lib/catalog-api', () => ({ fetchProducts: vi.fn() }));
vi.mock('@/lib/operational-api', () => ({ searchEligibleHomologs: vi.fn() }));

const product: Product = {
  id: '55555555-5555-4555-8555-555555555555',
  sku: '6205-2RS1',
  name: 'Rodamiento rígido de bolas',
  brand: 'FAG',
  category: 'Rodamientos',
  application: 'Automotriz',
  status: 'published',
  completeness: null,
  unifiedCode: 'UNI-000123',
  attributes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProducts).mockResolvedValue({
    items: [product],
    total: 1,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });
  vi.mocked(searchEligibleHomologs).mockResolvedValue([]);
});

describe('SmartSearchWorkspace', () => {
  it('queries both operational sources and summarizes only their response', async () => {
    render(<SmartSearchWorkspace initialQuery="" />);

    fireEvent.change(screen.getByLabelText('Consulta'), { target: { value: '6205' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith({ q: '6205', page: 1, pageSize: 50 }),
    );
    expect(searchEligibleHomologs).toHaveBeenCalledWith('6205');
    expect(await screen.findByText('6205-2RS1')).toBeInTheDocument();
    expect(
      screen.getByText('Resumen de «6205» basado solo en los resultados visibles.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/La API encontró 1 coincidencia directa/)).toBeInTheDocument();
  });

  it('does not manufacture recommendations when the backend returns no matches', async () => {
    vi.mocked(fetchProducts).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
    render(<SmartSearchWorkspace initialQuery="sin-coincidencia" />);

    expect(await screen.findByText('Sin resultados para «sin-coincidencia»')).toBeInTheDocument();
    expect(screen.getByText(/no recomendará alternativas/)).toBeInTheDocument();
  });
});
