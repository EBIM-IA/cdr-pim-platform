import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createOemCode, updateOemCode, deactivateOemCode } from '@/lib/operational-api';
import { ProductRelationsDrawer } from './product-relations-drawer';

vi.mock('@/lib/operational-api', () => ({
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deactivateApplication: vi.fn(),
  createHomolog: vi.fn(),
  updateHomolog: vi.fn(),
  deactivateHomolog: vi.fn(),
  createOemCode: vi.fn(),
  updateOemCode: vi.fn(),
  deactivateOemCode: vi.fn(),
}));
const onSaved = vi.fn(),
  onClose = vi.fn();
const base = {
  unifiedCode: 'UNI-1',
  applications: [],
  homologs: [],
  oemCodes: [],
  onSaved,
  onClose,
};
const existing = {
  id: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  unifiedCode: 'UNI-1',
  oemCode: 'OEM-A',
  brands: ['CDR'],
  active: true,
  approvalStatus: 'approved' as const,
  source: 'manual' as const,
  importBatchId: null,
  createdAt: '2026-11-01T15:00:00Z',
  updatedAt: '2026-11-10T15:00:00Z',
};
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('creates OEM in the product group without changing the product identity', async () => {
  render(<ProductRelationsDrawer {...base} kind="oem" />);
  fireEvent.change(screen.getByLabelText('Código OEM'), { target: { value: '000-ABC' } });
  fireEvent.change(screen.getByLabelText('Marcas (separadas por coma)'), {
    target: { value: 'CDR, SKF' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  await waitFor(() =>
    expect(createOemCode).toHaveBeenCalledWith({
      unifiedCode: 'UNI-1',
      oemCode: '000-ABC',
      brands: ['CDR', 'SKF'],
      approvalStatus: 'pending',
      active: true,
    }),
  );
  expect(onSaved).toHaveBeenCalledOnce();
});

it('edits with the row version and preserves the form when the server rejects a stale edit', async () => {
  vi.mocked(updateOemCode).mockRejectedValue(new Error('Otro usuario actualizó este registro.'));
  render(<ProductRelationsDrawer {...base} oemCodes={[existing]} kind="oem" />);
  fireEvent.change(screen.getByLabelText('Registro'), { target: { value: existing.id } });
  fireEvent.change(screen.getByLabelText('Código OEM'), { target: { value: 'OEM-B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Otro usuario');
  expect(updateOemCode).toHaveBeenCalledWith(existing.id, {
    oemCode: 'OEM-B',
    brands: ['CDR'],
    approvalStatus: 'approved',
    expectedUpdatedAt: existing.updatedAt,
  });
  expect(screen.getByLabelText('Código OEM')).toHaveValue('OEM-B');
  expect(onClose).not.toHaveBeenCalled();
});

it('deactivates the selected group relation using its expected timestamp', async () => {
  render(<ProductRelationsDrawer {...base} oemCodes={[existing]} kind="oem" />);
  fireEvent.change(screen.getByLabelText('Registro'), { target: { value: existing.id } });
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar registro' }));
  await waitFor(() =>
    expect(deactivateOemCode).toHaveBeenCalledWith(existing.id, existing.updatedAt),
  );
});
