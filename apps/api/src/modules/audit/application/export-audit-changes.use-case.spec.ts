import type { AuditChangeListDto } from '@cdr/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ListAuditChangesUseCase } from './list-audit-changes.use-case';
import { ExportAuditChangesUseCase } from './export-audit-changes.use-case';

describe('ExportAuditChangesUseCase', () => {
  it('exports every filtered page as UTF-8 BOM CSV separated by semicolons', async () => {
    const first: AuditChangeListDto = {
      page: 1,
      pageSize: 100,
      total: 101,
      items: [
        {
          id: 'af0cfdd6-c9a6-4fa1-8a6d-1a9d6687df97',
          auditEntryId: 'b6bff0b6-27d0-45f7-9933-108e0feee1fd',
          resourceType: 'product',
          resourceId: 'product-1',
          sku: '6202;2RS',
          action: 'updated',
          field: 'description',
          before: 'Anterior "A"',
          after: 'Nueva',
          previousValueValidFrom: null,
          actorId: null,
          source: 'api',
          correlationId: 'request-1',
          occurredAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    };
    const execute = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ ...first, page: 2, items: [] });
    const useCase = new ExportAuditChangesUseCase({
      execute,
    } as unknown as ListAuditChangesUseCase);

    const csv = await useCase.execute({
      page: 9,
      pageSize: 10,
      sku: '6202;2RS',
      to: '2026-01-31T23:59:59.000Z',
    });

    expect(execute).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 100,
      sku: '6202;2RS',
      to: '2026-01-31T23:59:59.000Z',
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 100,
      sku: '6202;2RS',
      to: '2026-01-31T23:59:59.000Z',
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Fec. Modificación Anterior"');
    expect(csv).toContain('"6202;2RS"');
    expect(csv).toContain('"Anterior ""A"""');
    expect(csv).toContain('"Primera modificación"');
    expect(csv).toMatch(/\r\n$/u);
  });

  it('rejects unbounded exports before accumulating them in memory', async () => {
    const execute = vi.fn().mockResolvedValue({
      page: 1,
      pageSize: 100,
      total: 10_001,
      items: [],
    });
    const useCase = new ExportAuditChangesUseCase({
      execute,
    } as unknown as ListAuditChangesUseCase);

    await expect(
      useCase.execute({
        page: 1,
        pageSize: 20,
        to: '2026-01-31T23:59:59.000Z',
      }),
    ).rejects.toThrow('exceeds the 10000 row limit');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
