import { describe, expect, it } from 'vitest';

import { auditChangeListQuerySchema, auditChangeListSchema } from './audit';

describe('audit HTTP contract', () => {
  it('coerces pagination and accepts all supported filters', () => {
    const query = auditChangeListQuerySchema.parse({
      page: '2',
      pageSize: '50',
      sku: ' 6202 ',
      resourceType: 'product',
      resourceId: 'product-1',
      field: 'diameter',
      source: 'api',
      actorId: 'buyer-1',
      from: '2026-01-01T00:00:00-05:00',
      to: '2026-02-01T00:00:00-05:00',
    });
    expect(query).toMatchObject({ page: 2, pageSize: 50, sku: '6202' });
  });

  it('rejects an inverted date range', () => {
    expect(() =>
      auditChangeListQuerySchema.parse({
        from: '2026-02-01T00:00:00Z',
        to: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
  });

  it('represents one row per changed field', () => {
    const response = auditChangeListSchema.parse({
      items: [
        {
          id: 'af0cfdd6-c9a6-4fa1-8a6d-1a9d6687df97',
          auditEntryId: 'b6bff0b6-27d0-45f7-9933-108e0feee1fd',
          resourceType: 'product',
          resourceId: 'product-1',
          sku: '6202',
          action: 'updated',
          field: 'diameter',
          before: 10,
          after: 11,
          previousValueValidFrom: '2026-01-01T10:00:00.000Z',
          actorId: 'buyer-1',
          source: 'api',
          correlationId: 'request-1',
          occurredAt: '2026-02-01T10:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    expect(response.items[0]?.field).toBe('diameter');
  });
});
