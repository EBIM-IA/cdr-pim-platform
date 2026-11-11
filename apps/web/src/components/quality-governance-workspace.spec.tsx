import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QualityReviewDto } from '@cdr/contracts';
import { QualityGovernanceWorkspace } from './quality-governance-workspace';
import { CommercialReviewHistory } from './commercial-review-history';
const mocks = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn(), detect: vi.fn() }));
vi.mock('@/lib/quality-governance-api', () => ({
  listQualityProductChanges: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listQualityReviews: mocks.list,
  decideQualityReview: mocks.decide,
  detectQualityDuplicates: mocks.detect,
  createQualityConflict: vi.fn(),
}));
const item: QualityReviewDto = {
  id: '10000000-0000-4000-8000-000000000001',
  kind: 'attribute',
  productId: '20000000-0000-4000-8000-000000000001',
  sku: '6205',
  attributeKey: 'material',
  currentValue: 'Acero',
  attributeVersion: 1,
  candidates: [
    { source: 'fabricante', value: 'Acero A', evidence: 'Ficha fabricante', confidence: null },
    { source: 'archivo', value: 'Acero B', evidence: 'Ficha vigente', confidence: null },
  ],
  proposedIndex: 0,
  chosenIndex: null,
  chosenValue: null,
  override: false,
  assetId: null,
  model: null,
  channel: null,
  productB: null,
  status: 'pending',
  duplicateDecision: null,
  reason: null,
  requestedBy: 'admin@example.test',
  decidedBy: null,
  createdAt: '2026-11-10T15:00:00Z',
  updatedAt: '2026-11-10T15:00:00Z',
  version: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ items: [item], total: 1 });
  mocks.decide.mockResolvedValue({ ...item, status: 'approved', version: 2 });
});
afterEach(cleanup);
describe('live review workspace', () => {
  it('loads persisted candidates, requires a reason and records an alternative-source override', async () => {
    render(<QualityGovernanceWorkspace mode="conflict" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
    const approve = screen.getByRole('button', { name: 'Aprobar' });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo de decisión' }), {
      target: { value: 'El archivo corresponde a la variante.' },
    });
    expect(screen.getByText(/La elección se registrará como override humano/)).toBeVisible();
    fireEvent.click(approve);
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith(item.id, {
        version: 1,
        action: 'approve',
        reason: 'El archivo corresponde a la variante.',
        chosenIndex: 1,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Decisión guardada');
  });
  it('keeps the review open and exposes concurrency errors without reporting success', async () => {
    mocks.decide.mockRejectedValue(new Error('La solicitud cambió. Recarga la bandeja.'));
    render(<QualityGovernanceWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo de decisión' }), {
      target: { value: 'Revisado.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    expect(await screen.findAllByText('La solicitud cambió. Recarga la bandeja.')).not.toHaveLength(
      0,
    );
    expect(screen.queryByText('Decisión guardada con motivo y trazabilidad.')).toBeNull();
  });
  it('compares duplicate SKU and saves a human disposition without a merge affordance', async () => {
    mocks.list.mockResolvedValue({
      items: [
        {
          ...item,
          kind: 'duplicate',
          productB: {
            id: '30000000-0000-4000-8000-000000000001',
            sku: '6205-B',
            name: 'Rodamiento B',
            brand: 'FAG',
          },
        },
      ],
      total: 1,
    });
    render(<QualityGovernanceWorkspace mode="duplicates" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Comparar' }));
    expect(screen.getByText('Rodamiento B')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Decisión humana' }), {
      target: { value: 'equivalent' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo de decisión' }), {
      target: { value: 'Equivalentes, mantener identidades ERP.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar decisión' }));
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({
          duplicateDecision: 'equivalent',
          reason: 'Equivalentes, mantener identidades ERP.',
        }),
      ),
    );
    expect(screen.queryByRole('button', { name: /fusionar/i })).toBeNull();
  });
  it('approves an edited commercial version from its persistent history with an explicit reason', async () => {
    mocks.list.mockResolvedValue({
      items: [
        {
          ...item,
          kind: 'commercial',
          channel: 'b2b',
          model: 'proveedor-configurado',
          currentValue: 'Descripción técnica original.',
        },
      ],
      total: 1,
    });
    render(
      <CommercialReviewHistory
        productId={item.productId}
        generatedReviewId={item.id}
        editedText="Texto editado para comprador técnico."
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar y aprobar' }));
    expect(screen.getByText('Descripción técnica original.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Versión comercial revisada' })).toHaveValue(
      'Texto editado para comprador técnico.',
    );
    expect(screen.getByRole('button', { name: 'Aprobar contenido comercial' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo de aprobación comercial' }), {
      target: { value: 'Validado para B2B.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar contenido comercial' }));
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith(item.id, {
        version: 1,
        action: 'approve',
        reason: 'Validado para B2B.',
        chosenIndex: 0,
        value: 'Texto editado para comprador técnico.',
      }),
    );
  });
});
