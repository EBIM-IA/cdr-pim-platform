import { describe, expect, it } from 'vitest';

import {
  AX_ID_LOTE_MAX_LENGTH,
  axSyncAcceptedResponseSchema,
  axSyncBatchStatusResponseSchema,
  axSyncRequestSchema,
} from './ax-integration';

const product = {
  codigoArticulo: '000123',
  codigoProveedor: 'PRV-01',
  codigoUnificador: 'UNI-9',
  codigoLinea: 'RODAMIENTOS',
  categoriaNivel3: 'RODAMIENTOS DE BOLAS RÍGIDOS',
  tipoAplicacion: 'AUTOMOTRIZ',
  marca: 'SKF',
  fechaModificacion: '2026-09-28T15:00:00Z',
};

const batch = {
  idLote: 'AX-20260928-000001',
  fechaEnvio: '2026-09-28T15:30:00Z',
  sistemaOrigen: 'SISMETIC_AX',
  productos: [product],
};

describe('AX -> PIM inbound contract', () => {
  it('accepts a valid batch and preserves codes verbatim', () => {
    expect(axSyncRequestSchema.parse(batch)).toEqual(batch);
    expect(
      axSyncRequestSchema.parse({
        ...batch,
        productos: [{ ...product, codigoArticulo: '000ab 12' }],
      }).productos[0]?.codigoArticulo,
    ).toBe('000ab 12');
  });

  it('rejects numeric, blank and unknown fields', () => {
    expect(() =>
      axSyncRequestSchema.parse({
        ...batch,
        productos: [{ ...product, codigoArticulo: 123 }],
      }),
    ).toThrow();
    expect(() =>
      axSyncRequestSchema.parse({
        ...batch,
        productos: [{ ...product, codigoArticulo: '   ' }],
      }),
    ).toThrow();
    expect(() => axSyncRequestSchema.parse({ ...batch, extra: true })).toThrow();
  });

  it('accepts UTC offsets and bounds the external batch id', () => {
    expect(
      axSyncRequestSchema.parse({ ...batch, fechaEnvio: '2026-09-28T10:30:00-05:00' }).fechaEnvio,
    ).toBe('2026-09-28T10:30:00-05:00');
    expect(() =>
      axSyncRequestSchema.parse({ ...batch, idLote: 'x'.repeat(AX_ID_LOTE_MAX_LENGTH + 1) }),
    ).toThrow();
  });

  it('describes the exact 202 and status responses', () => {
    const accepted = {
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      registrosRecibidos: 1,
      fechaRecepcion: '2026-09-28T15:30:01.000Z',
      correlationId: 'correlation-1',
    };
    expect(axSyncAcceptedResponseSchema.parse(accepted)).toEqual(accepted);
    expect(
      axSyncBatchStatusResponseSchema.parse({
        ...accepted,
        fechaEnvio: batch.fechaEnvio,
        sistemaOrigen: batch.sistemaOrigen,
        requestHash: `sha256:${'a'.repeat(64)}`,
      }),
    ).toMatchObject({ idLote: batch.idLote, estado: 'RECIBIDO' });
  });
});
