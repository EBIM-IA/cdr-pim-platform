import { describe, expect, it } from 'vitest';

import {
  AX_ID_LOTE_MAX_LENGTH,
  axProductSchema,
  axSyncAcceptedResponseSchema,
  axSyncRequestSchema,
} from './ax-integration';

const product = {
  codigoArticulo: '000123',
  codigoProveedor: 'PRV-01',
  codigoUnificador: 'UNI-9',
  codigoLinea: 'RODAMIENTOS',
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

function issuesOf(input: unknown): string[] {
  const result = axSyncRequestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('axSyncRequestSchema (AX contract v1.1, QAS mock)', () => {
  it('accepts a valid batch', () => {
    expect(axSyncRequestSchema.parse(batch)).toEqual(batch);
  });

  it('requires at least one product', () => {
    expect(issuesOf({ ...batch, productos: [] })).toEqual([expect.stringMatching(/^productos: /)]);
  });

  it('rejects codigoArticulo sent as a JSON number', () => {
    expect(issuesOf({ ...batch, productos: [{ ...product, codigoArticulo: 123 }] })).toEqual([
      expect.stringMatching(/^productos\.0\.codigoArticulo: Expected string/),
    ]);
  });

  it('preserves leading zeros, case and inner spacing of codigoArticulo verbatim', () => {
    const parsed = axSyncRequestSchema.parse({
      ...batch,
      productos: [{ ...product, codigoArticulo: '000ab 12' }],
    });
    expect(parsed.productos[0]?.codigoArticulo).toBe('000ab 12');
  });

  it('rejects a blank codigoArticulo without trimming the accepted ones', () => {
    expect(issuesOf({ ...batch, productos: [{ ...product, codigoArticulo: '   ' }] })).toEqual([
      'productos.0.codigoArticulo: must not be blank',
    ]);
    const parsed = axSyncRequestSchema.parse({
      ...batch,
      productos: [{ ...product, codigoArticulo: ' 0042 ' }],
    });
    expect(parsed.productos[0]?.codigoArticulo).toBe(' 0042 ');
  });

  it('rejects an invalid fechaEnvio', () => {
    expect(issuesOf({ ...batch, fechaEnvio: '28/09/2026 15:30' })).toEqual([
      expect.stringMatching(/^fechaEnvio: /),
    ]);
  });

  it('accepts fechaEnvio with an explicit UTC offset', () => {
    expect(issuesOf({ ...batch, fechaEnvio: '2026-09-28T10:30:00-05:00' })).toEqual([]);
  });

  it('rejects an invalid fechaModificacion', () => {
    expect(
      issuesOf({ ...batch, productos: [{ ...product, fechaModificacion: '2026-13-45' }] }),
    ).toEqual([expect.stringMatching(/^productos\.0\.fechaModificacion: /)]);
  });

  it('treats fechaModificacion as optional', () => {
    const { fechaModificacion: _omitted, ...withoutDate } = product;
    expect(issuesOf({ ...batch, productos: [withoutDate] })).toEqual([]);
  });

  it('treats codigoUnificador as optional', () => {
    const { codigoUnificador: _omitted, ...withoutUnifier } = product;
    expect(issuesOf({ ...batch, productos: [withoutUnifier] })).toEqual([]);
    expect(issuesOf({ ...batch, productos: [{ ...product, codigoUnificador: null }] })).toEqual([]);
  });

  it('temporarily accepts a missing tipoAplicacion (P-05 open)', () => {
    const { tipoAplicacion: _omitted, ...withoutType } = product;
    expect(issuesOf({ ...batch, productos: [withoutType] })).toEqual([]);
  });

  it('temporarily accepts a missing marca', () => {
    const { marca: _omitted, ...withoutBrand } = product;
    expect(issuesOf({ ...batch, productos: [withoutBrand] })).toEqual([]);
  });

  it('requires codigoProveedor and codigoLinea', () => {
    const { codigoProveedor: _p, codigoLinea: _l, ...partial } = product;
    expect(issuesOf({ ...batch, productos: [partial] })).toEqual([
      'productos.0.codigoProveedor: Required',
      'productos.0.codigoLinea: Required',
    ]);
  });

  it('treats sistemaOrigen as optional', () => {
    const { sistemaOrigen: _omitted, ...withoutSource } = batch;
    expect(issuesOf(withoutSource)).toEqual([]);
  });

  it('requires a non-blank idLote within the technical length bound', () => {
    expect(issuesOf({ ...batch, idLote: '' })).not.toEqual([]);
    expect(issuesOf({ ...batch, idLote: '  ' })).toEqual(['idLote: must not be blank']);
    expect(issuesOf({ ...batch, idLote: 'x'.repeat(AX_ID_LOTE_MAX_LENGTH + 1) })).toHaveLength(1);
  });

  it('fails closed on unknown fields, including the future atributosErp', () => {
    expect(issuesOf({ ...batch, extra: true })).toEqual([
      expect.stringMatching(/Unrecognized key/),
    ]);
    expect(
      issuesOf({ ...batch, productos: [{ ...product, atributosErp: [{ codigo: 'A' }] }] }),
    ).toEqual([expect.stringMatching(/^productos\.0: Unrecognized key.*atributosErp/)]);
  });
});

describe('axProductSchema', () => {
  it('never coerces or normalises a code', () => {
    expect(axProductSchema.parse({ ...product, codigoProveedor: '0007' }).codigoProveedor).toBe(
      '0007',
    );
  });
});

describe('axSyncAcceptedResponseSchema', () => {
  it('describes exactly the contractual 202 body', () => {
    const body = {
      idLote: batch.idLote,
      estado: 'RECIBIDO',
      registrosRecibidos: 1,
      fechaRecepcion: '2026-09-28T15:30:01.000Z',
      correlationId: '11111111-1111-4111-8111-111111111111',
    };
    expect(axSyncAcceptedResponseSchema.parse(body)).toEqual(body);
    expect(() => axSyncAcceptedResponseSchema.parse({ ...body, persisted: false })).toThrow();
    expect(() => axSyncAcceptedResponseSchema.parse({ ...body, estado: 'PROCESADO' })).toThrow();
  });
});
