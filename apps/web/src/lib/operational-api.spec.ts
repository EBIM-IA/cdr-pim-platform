import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createApplication,
  createOemCode,
  deactivateApplication,
  deactivateHomolog,
  listApplications,
  listAuditChanges,
  listOemCodes,
  searchEligibleHomologs,
  searchEligibleOemCodes,
  updateApplication,
  updateHomolog,
} from './operational-api';

const application = {
  id: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  unifiedCode: 'D1672',
  vehicleType: 'AUTOMOTRIZ',
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

const oem = {
  id: '33333333-3333-4333-8333-333333333333',
  groupId: '22222222-2222-4222-8222-222222222222',
  unifiedCode: 'D1672',
  oemCode: 'DEMO-OEM-D1672-A',
  brands: ['TOYOTA', 'LEXUS'],
  active: true,
  approvalStatus: 'approved',
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
      .mockImplementation(async () => new Response(JSON.stringify(application), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await createApplication({
      unifiedCode: 'D1672',
      vehicleType: 'AUTOMOTRIZ',
      make: 'Toyota',
      model: 'Hilux',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/operations/applications',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('D1672') }),
    );

    await updateApplication(application.id, {
      expectedUpdatedAt: application.updatedAt,
      make: 'Lexus',
    });
    await deactivateApplication(application.id, application.updatedAt);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/operations/applications/${application.id}?expectedUpdatedAt=${encodeURIComponent(application.updatedAt)}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('sends the optimistic token for homolog updates and soft-deactivation', async () => {
    const homolog = {
      id: '44444444-4444-4444-8444-444444444444',
      groupId: application.groupId,
      unifiedCode: 'D1672',
      externalCode: 'D-EXT',
      externalBrand: 'BOSCH',
      active: true,
      approvalStatus: 'approved',
      source: 'manual',
      importBatchId: null,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(homolog), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await updateHomolog(homolog.id, {
      expectedUpdatedAt: homolog.updatedAt,
      externalBrand: 'SKF',
    });
    await deactivateHomolog(homolog.id, homolog.updatedAt);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      expectedUpdatedAt: homolog.updatedAt,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/operations/equivalences/${homolog.id}?expectedUpdatedAt=${encodeURIComponent(homolog.updatedAt)}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('does not accept a malformed eligible-search response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([{ homolog: null }]), { status: 200 })),
    );
    await expect(searchEligibleHomologs('OEM-1')).rejects.toMatchObject({ status: 502 });
  });

  it('uses the dedicated OEM BFF routes and validates their contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([oem]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(oem), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listOemCodes({ unifiedCode: 'D1672' })).resolves.toEqual([oem]);
    await createOemCode({
      unifiedCode: 'D1672',
      oemCode: 'DEMO-OEM-D1672-A',
      brands: ['TOYOTA', 'LEXUS'],
      active: true,
      approvalStatus: 'approved',
    });
    await searchEligibleOemCodes('TOYOTA');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/operations/equivalences/oem?unifiedCode=D1672',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/operations/equivalences/oem/search?q=TOYOTA',
      expect.any(Object),
    );
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
