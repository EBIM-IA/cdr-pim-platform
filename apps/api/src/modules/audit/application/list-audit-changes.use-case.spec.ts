import { describe, expect, it } from 'vitest';

import type { AuditReadPort } from '../domain/ports/audit-read.port';
import { ListAuditChangesUseCase } from './list-audit-changes.use-case';

describe('ListAuditChangesUseCase', () => {
  it('maps dates and preserves field-level pagination', async () => {
    const readModel: AuditReadPort = {
      listChanges: async (filter) => {
        expect(filter.from).toEqual(new Date('2026-01-01T00:00:00Z'));
        return {
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
              previousValueValidFrom: new Date('2025-12-01T00:00:00Z'),
              actorId: 'buyer-1',
              source: 'api',
              correlationId: 'request-1',
              occurredAt: new Date('2026-01-15T00:00:00Z'),
            },
          ],
          total: 1,
        };
      },
    };
    const useCase = new ListAuditChangesUseCase(readModel);
    const result = await useCase.execute({
      page: 1,
      pageSize: 25,
      from: '2026-01-01T00:00:00Z',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      field: 'diameter',
      previousValueValidFrom: '2025-12-01T00:00:00.000Z',
      occurredAt: '2026-01-15T00:00:00.000Z',
    });
  });
});
