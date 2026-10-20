import { describe, expect, it } from 'vitest';

import {
  AX_MOCK_MAX_RECORDS,
  AX_MOCK_MAX_TOTAL_TEXT_LENGTH,
  axMockBatchSchema,
  axMockIdempotencyKeySchema,
  receiveAxMockBatchSchema,
} from './ax-integration';

const valid = {
  schemaVersion: 'draft-0' as const,
  batchId: 'AX-20261020-001',
  sentAt: '2026-10-20T15:00:00.000Z',
  records: [
    {
      recordId: '1',
      codigoArticulo: '6205-2RS',
      codigoProveedor: '6205-2RSH',
      codigoUnificador: '6205-2RS',
      linea: 'RODAMIENTOS',
      tipoAplicacion: 'AUTOMOTRIZ',
      marca: 'SKF',
      modifiedAt: '2026-10-20T14:59:00.000Z',
    },
  ],
};

describe('AX mock HTTP contracts', () => {
  it('accepts the explicit draft-0 canonical transport', () => {
    expect(receiveAxMockBatchSchema.parse(valid)).toMatchObject(valid);
  });

  it('keeps a missing article code inside the batch for per-row validation', () => {
    const parsed = receiveAxMockBatchSchema.parse({
      ...valid,
      records: [{ recordId: 'bad-row', codigoArticulo: null }],
    });
    expect(parsed.records[0]?.codigoArticulo).toBeNull();
  });

  it('rejects unknown fields, unsupported versions and oversized batches', () => {
    expect(() =>
      receiveAxMockBatchSchema.parse({ ...valid, undocumentedAxField: 'must-not-be-silent' }),
    ).toThrow();
    expect(() => receiveAxMockBatchSchema.parse({ ...valid, schemaVersion: 'v1' })).toThrow();
    expect(() =>
      receiveAxMockBatchSchema.parse({
        ...valid,
        records: Array.from({ length: AX_MOCK_MAX_RECORDS + 1 }, () => valid.records[0]),
      }),
    ).toThrow();
  });

  it('bounds aggregate raw text while preserving the 100-record contract', () => {
    const maximallyStructuredRecords = Array.from({ length: AX_MOCK_MAX_RECORDS }, () => ({
      recordId: '\u0000'.repeat(119),
      codigoArticulo: null,
      codigoProveedor: null,
      codigoUnificador: null,
      linea: null,
      tipoAplicacion: null,
      marca: null,
      categoriaNivel1: null,
      categoriaNivel2: null,
      categoriaNivel3: null,
      modifiedAt: null,
    }));
    const nearLimit = {
      schemaVersion: 'draft-0' as const,
      batchId: 'A',
      sentAt: valid.sentAt,
      records: maximallyStructuredRecords,
    };

    expect(receiveAxMockBatchSchema.parse(nearLimit).records).toHaveLength(AX_MOCK_MAX_RECORDS);
    expect(Buffer.byteLength(JSON.stringify(nearLimit))).toBeLessThan(100 * 1_024);

    expect(() =>
      receiveAxMockBatchSchema.parse({
        ...valid,
        batchId: 'A',
        records: Array.from({ length: AX_MOCK_MAX_RECORDS }, () => ({
          recordId: 'x'.repeat(Math.ceil(AX_MOCK_MAX_TOTAL_TEXT_LENGTH / AX_MOCK_MAX_RECORDS)),
        })),
      }),
    ).toThrow(/Batch text exceeds/);
  });

  it('counts raw text before trimming so padding cannot bypass the aggregate bound', () => {
    expect(() =>
      receiveAxMockBatchSchema.parse({
        ...valid,
        batchId: 'A',
        records: Array.from({ length: AX_MOCK_MAX_RECORDS }, () => ({
          codigoArticulo: ' '.repeat(64),
          codigoUnificador: ' '.repeat(64),
        })),
      }),
    ).toThrow(/Batch text exceeds/);
  });

  it('requires a bounded idempotency key', () => {
    expect(axMockIdempotencyKeySchema.parse('ax-batch-0001')).toBe('ax-batch-0001');
    expect(() => axMockIdempotencyKeySchema.parse('short')).toThrow();
  });

  it('validates the response totals and row results', () => {
    expect(
      axMockBatchSchema.parse({
        schemaVersion: 'draft-0',
        batchId: valid.batchId,
        sentAt: valid.sentAt,
        receivedAt: '2026-10-20T15:00:01.000Z',
        status: 'processed',
        totals: { received: 1, accepted: 1, warnings: 0, rejected: 0 },
        records: [
          {
            rowNumber: 1,
            recordId: '1',
            codigoArticulo: '6205-2RS',
            status: 'accepted',
            issues: [],
          },
        ],
        correlationId: 'correlation-1',
      }),
    ).toBeDefined();
  });

  it('rejects incoherent response totals and aggregate status', () => {
    const response = {
      schemaVersion: 'draft-0' as const,
      batchId: valid.batchId,
      sentAt: valid.sentAt,
      receivedAt: '2026-10-20T15:00:01.000Z',
      status: 'processed' as const,
      totals: { received: 2, accepted: 2, warnings: 0, rejected: 0 },
      records: [
        {
          rowNumber: 2,
          recordId: '1',
          codigoArticulo: null,
          status: 'rejected' as const,
          issues: [],
        },
      ],
      correlationId: 'correlation-1',
    };

    const parsed = axMockBatchSchema.safeParse(response);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining([
          'records.0.rowNumber',
          'totals.received',
          'totals.accepted',
          'totals.rejected',
          'status',
        ]),
      );
    }
  });

  it('rejects negative response counters before checking cross-field invariants', () => {
    expect(() =>
      axMockBatchSchema.parse({
        schemaVersion: 'draft-0',
        batchId: valid.batchId,
        sentAt: valid.sentAt,
        receivedAt: '2026-10-20T15:00:01.000Z',
        status: 'processed',
        totals: { received: 1, accepted: -1, warnings: 0, rejected: 0 },
        records: [
          {
            rowNumber: 1,
            recordId: '1',
            codigoArticulo: '6205-2RS',
            status: 'accepted',
            issues: [],
          },
        ],
        correlationId: 'correlation-1',
      }),
    ).toThrow();
  });
});
