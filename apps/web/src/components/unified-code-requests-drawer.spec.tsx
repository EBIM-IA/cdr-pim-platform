import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createUnifiedCodeRequest, listUnifiedCodeRequests } from '@/lib/unified-code-requests-api';
import { UnifiedCodeRequestsDrawer } from './unified-code-requests-drawer';
vi.mock('@/lib/unified-code-requests-api', () => ({
  createUnifiedCodeRequest: vi.fn(),
  listUnifiedCodeRequests: vi.fn(),
  updateUnifiedCodeRequest: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listUnifiedCodeRequests).mockResolvedValue([]);
});
afterEach(cleanup);
describe('unified code request UI', () => {
  it('registers a reasoned request with its current group and identifies it as pending dispatch', async () => {
    render(
      <UnifiedCodeRequestsDrawer
        products={[{ sku: 'TEST-1', unifiedCode: '6205' }]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Código unificador propuesto'), {
      target: { value: '6206' },
    });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Medidas diferentes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar solicitud' }));
    await waitFor(() =>
      expect(createUnifiedCodeRequest).toHaveBeenCalledWith({
        sku: 'TEST-1',
        currentCode: '6205',
        action: 'correct',
        proposedCode: '6206',
        reason: 'Medidas diferentes',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Por enviar a AX');
  });
});
