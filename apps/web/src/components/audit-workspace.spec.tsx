import type { AuditChangeDto, AuditChangeListDto } from '@cdr/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listAuditChanges: vi.fn(), downloadAuditChangesCsv: vi.fn() }));
vi.mock('@/lib/operational-api', () => api);

import { AuditWorkspace } from './audit-workspace';

const change = (overrides: Partial<AuditChangeDto> = {}): AuditChangeDto => ({
  id: '10000000-0000-4000-8000-000000000001',
  auditEntryId: '20000000-0000-4000-8000-000000000001',
  resourceType: 'product',
  resourceId: '30000000-0000-4000-8000-000000000001',
  sku: '6205-2RS',
  action: 'updated',
  field: 'marca',
  before: 'SKF',
  after: 'FAG',
  previousValueValidFrom: null,
  actorId: 'admin-1',
  source: 'api',
  correlationId: 'correlation-1',
  occurredAt: '2026-10-28T12:00:00.000Z',
  ...overrides,
});
const list = (items: AuditChangeDto[] = [], total = items.length): AuditChangeListDto => ({
  items,
  total,
  page: 1,
  pageSize: 25,
});
const metric = (label: string) => within(screen.getByText(label).parentElement!);

beforeEach(() => {
  vi.clearAllMocks();
  api.listAuditChanges.mockResolvedValue(list());
});
afterEach(cleanup);

describe('AuditWorkspace', () => {
  it('keeps the four indicators and every table heading visible for an empty history', async () => {
    render(<AuditWorkspace embedded />);
    expect(await screen.findByRole('heading', { name: 'Sin cambios registrados' })).toBeVisible();
    expect(screen.getByLabelText('Indicadores de auditoría')).toBeVisible();
    for (const label of ['Cambios', 'Eventos', 'Actores', 'SKU afectados'])
      expect(metric(label).getByText('0')).toBeVisible();
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('columnheader')).toHaveLength(9);
    expect(table.getByRole('columnheader', { name: 'Fec. Modificación Anterior' })).toBeVisible();
    expect(table.getByRole('columnheader', { name: 'Antes' })).toBeVisible();
    expect(table.getByRole('columnheader', { name: 'Después' })).toBeVisible();
    expect(api.listAuditChanges).toHaveBeenCalledTimes(1);
  });

  it('distinguishes the total filtered changes from unique events, actors and product SKUs on the page', async () => {
    api.listAuditChanges.mockResolvedValue(
      list(
        [
          change(),
          change({ id: '10000000-0000-4000-8000-000000000002', field: 'diametro' }),
          change({
            id: '10000000-0000-4000-8000-000000000003',
            auditEntryId: '20000000-0000-4000-8000-000000000002',
            sku: null,
            actorId: null,
            resourceType: 'product_name_settings',
            resourceId: 'product-name',
          }),
        ],
        100,
      ),
    );
    render(<AuditWorkspace embedded />);
    await screen.findByRole('heading', { name: 'Historial de cambios' });
    expect(metric('Cambios').getByText('100')).toBeVisible();
    expect(metric('Cambios').getByText('con los filtros aplicados')).toBeVisible();
    expect(metric('Eventos').getByText('2')).toBeVisible();
    expect(metric('Eventos').getByText('únicos en esta página')).toBeVisible();
    expect(metric('Actores').getByText('1')).toBeVisible();
    expect(metric('SKU afectados').getByText('1')).toBeVisible();
    expect(api.listAuditChanges).toHaveBeenCalledTimes(1);
  });

  it('updates the totals and page statistics using the existing filtered request', async () => {
    api.listAuditChanges.mockResolvedValueOnce(list([change()], 100)).mockResolvedValue(list());
    render(<AuditWorkspace embedded />);
    await screen.findByRole('heading', { name: 'Historial de cambios' });
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'NO-EXISTE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await screen.findByRole('heading', { name: 'Sin cambios registrados' });
    expect(metric('Cambios').getByText('0')).toBeVisible();
    expect(metric('SKU afectados').getByText('0')).toBeVisible();
    expect(api.listAuditChanges).toHaveBeenCalledTimes(2);
    expect(api.listAuditChanges).toHaveBeenLastCalledWith(
      expect.objectContaining({ sku: 'NO-EXISTE', page: 1 }),
    );
  });

  it('shows unavailable values instead of zero when the request fails and retains table headings', async () => {
    api.listAuditChanges.mockRejectedValue(new Error('Servicio no disponible'));
    render(<AuditWorkspace embedded />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Servicio no disponible'),
    );
    for (const label of ['Cambios', 'Eventos', 'Actores', 'SKU afectados'])
      expect(metric(label).getByText('—')).toBeVisible();
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
  });
});
