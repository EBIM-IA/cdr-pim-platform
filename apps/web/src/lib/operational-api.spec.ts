import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createApplication,
  listApplications,
  listAuditChanges,
  searchEligibleHomologs,
} from './operational-api';

const application = {
  id: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  unifiedCode: 'D1672',
  vehicleType: 'Automóvil',
  make: 'Toyota',
  model: 'Hilux',
  yearFrom: 2016,
  yearTo: 2024,
  engine: '2.8',
  notes: null,
  active: true,
  source: 'manual',
  importBatchId: null,
  createdAt: '2026-10-05T10:00:00.000Z',
  updatedAt: '2026-10-05T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('operational BFF client', () => {
  it('validates and returns applications from the private BFF', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([application]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listApplications({ includeInactive: true })).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/operations/applications?includeInactive=true',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('sends typed application mutations through the same-origin route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(application), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await createApplication({ unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/operations/applications',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('D1672') }),
    );
  });

  it('does not accept a malformed eligible-search response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([{ homolog: null }]), { status: 200 })),
    );
    await expect(searchEligibleHomologs('OEM-1')).rejects.toMatchObject({ status: 502 });
  });

  it('serializes pagination and audit filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 2, pageSize: 10, total: 0 }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await listAuditChanges({ page: 2, pageSize: 10, sku: '6202' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/operations/audit?page=2&pageSize=10&sku=6202',
      expect.any(Object),
    );
  });
});
