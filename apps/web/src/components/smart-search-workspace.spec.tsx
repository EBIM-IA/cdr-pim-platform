import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProducts } from '@/lib/catalog-api';
import { parseCode } from '@/lib/code-affix-api';
import { searchEligibleHomologs, searchEligibleOemCodes } from '@/lib/operational-api';
import { semanticSearch } from '@/lib/search-api';
import type { Product } from '@/lib/types';

import { SmartSearchWorkspace } from './smart-search-workspace';

vi.mock('@/lib/catalog-api', () => ({ fetchProducts: vi.fn() }));
vi.mock('@/lib/code-affix-api', () => ({ parseCode: vi.fn() }));
vi.mock('@/lib/operational-api', () => ({
  searchEligibleHomologs: vi.fn(),
  searchEligibleOemCodes: vi.fn(),
}));
vi.mock('@/lib/search-api', () => ({ semanticSearch: vi.fn() }));

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
  vi.mocked(searchEligibleOemCodes).mockResolvedValue([]);
  vi.mocked(semanticSearch).mockResolvedValue({
    query: '6205',
    model: 'fake-embedding-v1',
    dimensions: 1536,
    hits: [],
  });
  vi.mocked(parseCode).mockResolvedValue({ code: '6205', normalizedCode: '6205', segments: [] });
});

afterEach(cleanup);

describe('SmartSearchWorkspace', () => {
  it('queries the direct, semantic and approved-relation sources through their BFF clients', async () => {
    render(<SmartSearchWorkspace initialQuery="" />);

    fireEvent.change(screen.getByLabelText('Consulta'), { target: { value: '6205' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith({ q: '6205', page: 1, pageSize: 50 }),
    );
    expect(semanticSearch).toHaveBeenCalledWith('6205', 20);
    expect(searchEligibleHomologs).toHaveBeenCalledWith('6205');
    expect(searchEligibleOemCodes).toHaveBeenCalledWith('6205');
    expect(parseCode).toHaveBeenCalledWith({ code: '6205' });
    expect(await screen.findByText('6205-2RS1')).toBeInTheDocument();
    expect(
      screen.getByText('Resumen de «6205» basado solo en los resultados visibles.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/La API encontró 1 coincidencia directa/)).toBeInTheDocument();
  });

  it('enriches semantic search from validated affixes and deduplicates products by id', async () => {
    vi.mocked(parseCode).mockResolvedValue({
      code: '6205-C3',
      normalizedCode: '6205-C3',
      segments: [
        {
          kind: 'suffix',
          text: 'C3',
          ruleId: '11111111-1111-4111-8111-111111111111',
          meaning: 'Juego radial mayor al normal',
          attribute: 'Juego radial',
          impliedValue: 'C3',
          source: 'manufacturer',
          confidence: 1,
          evidence: 'Catálogo fabricante',
          boreMillimeters: null,
        },
      ],
    });
    vi.mocked(semanticSearch).mockResolvedValue({
      query: '6205-C3 Juego radial mayor al normal Juego radial C3',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      hits: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          score: 0.97,
        },
        {
          productId: '66666666-6666-4666-8666-666666666666',
          sku: '6301-C3',
          name: 'Rodamiento 6301 con juego C3',
          score: 0.78,
        },
      ],
    });
    vi.mocked(searchEligibleHomologs).mockResolvedValue([
      {
        homolog: {
          id: '77777777-7777-4777-8777-777777777777',
          groupId: '88888888-8888-4888-8888-888888888888',
          unifiedCode: 'UNI-000123',
          externalCode: 'HOM-C3',
          externalBrand: 'FAG',
          active: true,
          approvalStatus: 'approved',
          source: 'manual',
          importBatchId: null,
          createdAt: '2026-10-07T10:00:00.000Z',
          updatedAt: '2026-10-07T10:00:00.000Z',
        },
        products: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            sku: '6301-C3',
            name: 'Rodamiento 6301 con juego C3',
            brand: 'FAG',
            status: 'published',
          },
        ],
      },
    ]);

    render(<SmartSearchWorkspace initialQuery="6205-C3" />);

    expect(await screen.findByText('Interpretación del código')).toBeInTheDocument();
    expect(screen.getByText(/Juego radial mayor al normal/)).toBeInTheDocument();
    expect(semanticSearch).toHaveBeenCalledWith(
      '6205-C3 Juego radial mayor al normal Juego radial C3',
      20,
    );
    expect(screen.getAllByText('6205-2RS1')).toHaveLength(1);
    expect(screen.getAllByText('6301-C3')).toHaveLength(1);
    expect(
      screen.getByText(
        'Los SKU vinculados ya aparecen una sola vez entre los resultados anteriores.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/con 2 SKU únicos relacionados/)).toBeInTheDocument();
  });

  it('does not manufacture recommendations when the backend returns no matches', async () => {
    vi.mocked(fetchProducts).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
    vi.mocked(semanticSearch).mockResolvedValue({
      query: 'sin-coincidencia',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      hits: [],
    });
    render(<SmartSearchWorkspace initialQuery="sin-coincidencia" />);

    expect(await screen.findByText('Sin resultados para «sin-coincidencia»')).toBeInTheDocument();
    expect(screen.getByText(/no recomendará alternativas/)).toBeInTheDocument();
  });

  it('keeps successful catalogue results when an optional search source is unavailable', async () => {
    vi.mocked(semanticSearch).mockRejectedValue(new Error('Índice no disponible'));

    render(<SmartSearchWorkspace initialQuery="6205" />);

    expect(await screen.findByText('6205-2RS1')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Resultados parciales: no fue posible consultar índice semántico. Las demás fuentes siguen disponibles.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('La búsqueda no se pudo completar')).not.toBeInTheDocument();
  });
});
