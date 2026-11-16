import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QualityDuplicateComparison } from './quality-duplicate-comparison';
const mocks = vi.hoisted(() => ({ sheet: vi.fn(), product: vi.fn() }));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchProductAttributeSheet: mocks.sheet }));
vi.mock('@/lib/catalog-api', () => ({ fetchProduct: mocks.product }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const sheet = (id: string) => ({
  schema: {
    category: { name: 'Rodamientos' },
    template: { name: 'Rodamientos' },
    columns: [
      { key: 'codigoUnificador', label: 'Código unificador', unit: null },
      { key: 'codigoProveedor', label: 'Código proveedor', unit: null },
      { key: 'load', label: 'Carga', unit: null },
      { key: 'sealed', label: 'Sellado', unit: null },
    ],
  },
  product: {
    id,
    sku: id,
    name: 'Rodamiento',
    brand: 'FAG',
    status: 'in_review',
    attributes: {
      codigoUnificador: { value: 'UNI-1', source: 'erp' },
      codigoProveedor: { value: 'P-1', source: 'erp' },
      load: { value: 0, source: 'manual' },
      sealed: { value: false, source: 'document_extraction' },
    },
  },
});
describe('duplicate comparison evidence', () => {
  it('shows actual grouping and identifiers and treats zero and false as comparable data', async () => {
    mocks.sheet.mockImplementation(async (id: string) => sheet(id));
    mocks.product.mockImplementation(async (id: string) => ({
      id,
      unifiedCode: 'UNI-1',
      providerCode: 'P-1',
      application: 'Industrial',
    }));
    render(<QualityDuplicateComparison productA="SKU-A" productB="SKU-B" />);
    expect(await screen.findByRole('link', { name: 'UNI-1' })).toHaveAttribute(
      'href',
      '/equivalences?view=groups&group=UNI-1',
    );
    const load = screen.getByText('Carga').closest('tr')!;
    expect(within(load).getAllByText('0')).toHaveLength(2);
    expect(within(load).getByText('Coincide')).toBeVisible();
    const sealed = screen.getByText('Sellado').closest('tr')!;
    expect(within(sealed).getAllByText('No')).toHaveLength(2);
    expect(within(sealed).getByText('Coincide')).toBeVisible();
    expect(
      within(screen.getByText('Código de proveedor').closest('tr')!).getAllByText('P-1'),
    ).toHaveLength(2);
  });
  it('offers retry when actual source data cannot be loaded', async () => {
    mocks.sheet
      .mockRejectedValueOnce(new Error('Fuente temporalmente no disponible'))
      .mockImplementation(async (id: string) => sheet(id));
    mocks.product.mockResolvedValue({ providerCode: 'P-1' });
    render(<QualityDuplicateComparison productA="SKU-A" productB="SKU-B" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fuente temporalmente no disponible',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar comparación' }));
    expect(await screen.findByRole('table')).toBeVisible();
  });
});
