import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EcommerceDescriptionDto, ProductSalesVariantDto } from '@cdr/contracts';
import { fetchEcommerceDescription, saveEcommerceDescription } from '@/lib/ecommerce-api';
import { EcommerceDescriptionCard } from './ecommerce-description-card';
vi.mock('@/lib/ecommerce-api', () => ({
  fetchEcommerceDescription: vi.fn(),
  saveEcommerceDescription: vi.fn(),
}));
const variant: ProductSalesVariantDto = {
  productId: '10000000-0000-4000-8000-000000000001',
  codigoArticulo: '6205',
  nombreAmigable: 'Rodamiento SKF',
  tipo: 'industrial',
  marca: 'SKF',
  codigoProveedor: '6205',
  codigoUnificador: 'CU-1',
  aplicacion: null,
  ficha: '/products/10000000-0000-4000-8000-000000000001',
};
const text: EcommerceDescriptionDto = {
  productId: variant.productId,
  variantKey: 'industrial:industrial',
  titulo: 'Rodamiento SKF',
  descripcion: 'Texto comercial registrado.',
  status: 'pending',
  origin: 'ai',
  model: 'fake-generation-v1',
  version: 1,
  stale: false,
  updatedAt: '2026-11-09T15:00:00Z',
  updatedBy: 'admin@example.test',
  approvedAt: null,
  approvedBy: null,
};
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchEcommerceDescription).mockResolvedValue(null);
});
describe('ecommerce review card', () => {
  it('generates a persisted proposal and approves the returned version explicitly', async () => {
    vi.mocked(saveEcommerceDescription)
      .mockResolvedValueOnce(text)
      .mockResolvedValueOnce({
        ...text,
        status: 'approved',
        version: 2,
        approvedBy: 'admin@example.test',
      });
    render(<EcommerceDescriptionCard variant={variant} canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generar con IA' }));
    expect(await screen.findByText('Por revisar')).toBeVisible();
    expect(saveEcommerceDescription).toHaveBeenCalledWith(variant.productId, {
      type: 'industrial',
      applicationId: null,
      action: 'generate',
      version: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText('Aprobada')).toBeVisible();
    expect(saveEcommerceDescription).toHaveBeenLastCalledWith(variant.productId, {
      type: 'industrial',
      applicationId: null,
      action: 'approve',
      version: 1,
    });
  });
  it('preserves the manual draft and version after a conflict', async () => {
    vi.mocked(fetchEcommerceDescription).mockResolvedValue(text);
    vi.mocked(saveEcommerceDescription).mockRejectedValue(
      new Error('Otra persona cambió el texto.'),
    );
    render(<EcommerceDescriptionCard variant={variant} canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir texto' }));
    fireEvent.change(screen.getByLabelText('Título ecommerce'), {
      target: { value: 'Título revisado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y aprobar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Otra persona');
    expect(screen.getByLabelText('Título ecommerce')).toHaveValue('Título revisado');
    expect(saveEcommerceDescription).toHaveBeenCalledWith(
      variant.productId,
      expect.objectContaining({
        version: 1,
        text: { titulo: 'Título revisado', descripcion: text.descripcion },
      }),
    );
  });
  it('renders only consultation actions for approved copy and hides a missing description', async () => {
    vi.mocked(fetchEcommerceDescription).mockResolvedValue({ ...text, status: 'approved' });
    const view = render(<EcommerceDescriptionCard variant={variant} canManage={false} />);
    expect(await screen.findByText(text.descripcion)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copiar texto' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Corregir texto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Otra versión con IA' })).not.toBeInTheDocument();
    view.unmount();
    vi.mocked(fetchEcommerceDescription).mockResolvedValue(null);
    render(<EcommerceDescriptionCard variant={variant} canManage={false} />);
    await waitFor(() =>
      expect(screen.queryByLabelText('Descripción para e-commerce')).not.toBeInTheDocument(),
    );
  });
  it('marks stale text and requires correction or regeneration before approval', async () => {
    vi.mocked(fetchEcommerceDescription).mockResolvedValue({ ...text, stale: true });
    render(<EcommerceDescriptionCard variant={variant} canManage />);
    expect(await screen.findByText('Desactualizada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });
});
