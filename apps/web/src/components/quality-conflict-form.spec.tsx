import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QualityConflictForm } from './quality-conflict-form';
const mocks = vi.hoisted(() => ({ search: vi.fn(), sheet: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/catalog-api', () => ({ fetchProducts: mocks.search }));
vi.mock('@/lib/dynamic-catalog-api', () => ({ fetchProductAttributeSheet: mocks.sheet }));
vi.mock('@/lib/quality-governance-api', () => ({ createQualityConflict: mocks.create }));
const productId = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue({ items: [{ id: productId, sku: '6205', name: 'Rodamiento' }] });
  mocks.sheet.mockResolvedValue({
    schema: {
      columns: [
        {
          key: 'diameter',
          label: 'Diámetro',
          dataType: 'measurement',
          sourceAuthority: 'pim',
          permissions: { edit: true },
        },
      ],
    },
    product: { id: productId },
  });
  mocks.create.mockResolvedValue({});
});
afterEach(cleanup);
async function chooseProduct() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar SKU' }), {
    target: { value: '6205' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  await screen.findByRole('option', { name: '6205 · Rodamiento' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), {
    target: { value: productId },
  });
  await screen.findByRole('textbox', { name: 'Valor 1' });
}
describe('source conflict registration', () => {
  it('registers four sourced candidates with numeric values and keeps evidence per source', async () => {
    const created = vi.fn();
    render(<QualityConflictForm onClose={vi.fn()} onCreated={created} />);
    await chooseProduct();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar candidato de otra fuente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar candidato de otra fuente' }));
    for (let index = 1; index <= 4; index++) {
      fireEvent.change(screen.getByRole('textbox', { name: `Valor ${index}` }), {
        target: { value: `${index},5` },
      });
      fireEvent.change(screen.getByRole('textbox', { name: `Evidencia ${index}` }), {
        target: { value: `Referencia ${index}` },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Registrar para revisión' }));
    await waitFor(() => expect(created).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith({
      productId,
      attributeKey: 'diameter',
      candidates: [
        { source: 'fabricante', value: 1.5, evidence: 'Referencia 1', confidence: null },
        { source: 'archivo', value: 2.5, evidence: 'Referencia 2', confidence: null },
        { source: 'tecdoc', value: 3.5, evidence: 'Referencia 3', confidence: null },
        { source: 'manual', value: 4.5, evidence: 'Referencia 4', confidence: null },
      ],
    });
  });
  it('rejects invalid numeric input locally instead of registering NaN', async () => {
    render(<QualityConflictForm onClose={vi.fn()} onCreated={vi.fn()} />);
    await chooseProduct();
    for (let index = 1; index <= 2; index++) {
      fireEvent.change(screen.getByRole('textbox', { name: `Valor ${index}` }), {
        target: { value: 'desconocido' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: `Evidencia ${index}` }), {
        target: { value: 'Referencia' },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Registrar para revisión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('número válido');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
