import { describe, expect, it } from 'vitest';

import {
  AxContractWarningCode,
  MAX_WARNING_INDEXES,
  canonicalJson,
  contractWarnings,
} from './ax-batch-reception';

describe('contractWarnings', () => {
  it('reports nothing for a complete batch', () => {
    expect(contractWarnings([{ tipoAplicacion: 'A', marca: 'SKF' }])).toEqual([]);
  });

  it('reports absent, null and blank tipoAplicacion / marca by position only', () => {
    expect(
      contractWarnings([
        { tipoAplicacion: 'A', marca: 'SKF' },
        { marca: 'NTN' },
        { tipoAplicacion: null, marca: '  ' },
      ]),
    ).toEqual([
      {
        code: AxContractWarningCode.TIPO_APLICACION_MISSING,
        pendingDecision: 'P-05',
        count: 2,
        productIndexes: [1, 2],
      },
      {
        code: AxContractWarningCode.MARCA_MISSING,
        pendingDecision: 'P-04/P-05',
        count: 1,
        productIndexes: [2],
      },
    ]);
  });

  it('caps the logged positions but keeps the true count', () => {
    const products = Array.from({ length: MAX_WARNING_INDEXES + 10 }, () => ({ marca: 'X' }));
    const [warning] = contractWarnings(products);
    expect(warning?.count).toBe(MAX_WARNING_INDEXES + 10);
    expect(warning?.productIndexes).toHaveLength(MAX_WARNING_INDEXES);
  });
});

describe('canonicalJson', () => {
  it('is independent of key order and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [3, 1] }, b: 1 }),
    );
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it('keeps string values verbatim', () => {
    expect(canonicalJson({ codigoArticulo: '000123' })).toBe('{"codigoArticulo":"000123"}');
  });
});
