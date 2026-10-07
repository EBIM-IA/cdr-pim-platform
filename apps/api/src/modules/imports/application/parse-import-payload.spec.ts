import { describe, expect, it } from 'vitest';

import { parseImportPayload } from './parse-import-payload';

describe('parseImportPayload', () => {
  it('parses quoted CSV and validates homolog eligibility fields', () => {
    const rows = parseImportPayload({
      target: 'homologs',
      format: 'csv',
      idempotencyKey: 'meeting-0001',
      csv: 'unifiedCode,externalCode,externalBrand,active,approvalStatus\nD1672,"OEM,42",BOSCH,true,approved',
    });
    expect(rows).toEqual([
      expect.objectContaining({
        valid: true,
        data: expect.objectContaining({ externalCode: 'OEM,42' }),
      }),
    ]);
  });

  it('detects semicolon CSV and preserves delimiters and escaped quotes inside quoted cells', () => {
    const rows = parseImportPayload({
      target: 'homologs',
      format: 'csv',
      idempotencyKey: 'semicolon-quoted-0001',
      csv: 'unifiedCode;externalCode;externalBrand\nD1672;"OEM;42";"ACME, ""Norte"""',
    });

    expect(rows).toEqual([
      expect.objectContaining({
        valid: true,
        data: expect.objectContaining({
          externalCode: 'OEM;42',
          externalBrand: 'ACME, "Norte"',
        }),
        warnings: [],
      }),
    ]);
  });

  it('reports invalid application rows without discarding their data', () => {
    const rows = parseImportPayload({
      target: 'applications',
      format: 'json',
      idempotencyKey: 'meeting-0002',
      records: [{ unifiedCode: 'D1672', yearFrom: 2025, yearTo: 2020 }],
    });
    expect(rows[0]).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'vehicleType is required',
        'make is required',
        'model is required',
        'yearFrom must not exceed yearTo',
      ]),
    });
  });

  it('enforces and normalizes the approved application identity fields', () => {
    const [valid, invalid] = parseImportPayload({
      target: 'applications',
      format: 'json',
      idempotencyKey: 'application-required-fields',
      records: [
        {
          unifiedCode: 'D1672',
          vehicleType: 'Automóvil',
          make: 'Toyota',
          model: 'Hilux',
        },
        {
          unifiedCode: 'D1672',
          vehicleType: 'Agrícola',
          make: '',
          model: '',
        },
      ],
    });
    expect(valid).toMatchObject({
      valid: true,
      data: { vehicleType: 'AUTOMOTRIZ', make: 'Toyota', model: 'Hilux' },
    });
    expect(invalid).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'vehicleType must be AUTOMOTRIZ or INDUSTRIAL',
        'make is required',
        'model is required',
      ]),
    });
  });

  it('accepts the Spanish column names published in the downloadable templates', () => {
    const [application] = parseImportPayload({
      target: 'applications',
      format: 'csv',
      idempotencyKey: 'meeting-0004',
      csv: 'codigo_unificador,tipo_aplicacion,marca_industria,modelo_equipo,anio_desde,anio_hasta\nD1672,Automotriz,Toyota,Hilux,2016,2024',
    });
    const [homolog] = parseImportPayload({
      target: 'homologs',
      format: 'csv',
      idempotencyKey: 'meeting-0005',
      csv: 'codigo_unificador,codigo_homologo,marca_homologo\nD1672,D-123,BOSCH',
    });

    expect(application).toMatchObject({
      valid: true,
      data: { unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' },
    });
    expect(homolog).toMatchObject({
      valid: true,
      data: { unifiedCode: 'D1672', externalCode: 'D-123', externalBrand: 'BOSCH' },
    });
  });

  it('canonicalizes OEM aliases and multi-brand values in CSV and JSON', () => {
    const [csv] = parseImportPayload({
      target: 'oem',
      format: 'csv',
      idempotencyKey: 'oem-import-0001',
      csv: 'codigo_unificador,codigo_oem,marcas,estado_aprobacion,activo\nD1672,04465-0K240,TOYOTA;LEXUS,approved,true',
    });
    const [json] = parseImportPayload({
      target: 'oem',
      format: 'json',
      idempotencyKey: 'oem-import-0002',
      records: [
        { codigo_unificador: 'D1672', codigo_oem: '04465-0K240', marcas: ['TOYOTA', 'LEXUS'] },
      ],
    });

    expect(csv).toMatchObject({
      valid: true,
      data: { unifiedCode: 'D1672', oemCode: '04465-0K240', brands: ['TOYOTA', 'LEXUS'] },
    });
    expect(json).toMatchObject({
      valid: true,
      data: { unifiedCode: 'D1672', oemCode: '04465-0K240', brands: ['TOYOTA', 'LEXUS'] },
    });
  });

  it('reports contract-sized field errors per row instead of failing the whole import', () => {
    const [application, homolog, oem] = [
      parseImportPayload({
        target: 'applications',
        format: 'json',
        idempotencyKey: 'limits-application',
        records: [{ unifiedCode: 'D1672', make: 'M'.repeat(161) }],
      })[0],
      parseImportPayload({
        target: 'homologs',
        format: 'json',
        idempotencyKey: 'limits-homolog',
        records: [{ unifiedCode: 'D1672', externalCode: 'C'.repeat(161), externalBrand: 'BOSCH' }],
      })[0],
      parseImportPayload({
        target: 'oem',
        format: 'json',
        idempotencyKey: 'limits-oem-code',
        records: [{ unifiedCode: 'D1672', oemCode: 'OEM-1', brands: ['B'.repeat(161)] }],
      })[0],
    ];

    expect(application).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'vehicleType is required',
        'make must contain at most 160 characters',
        'model is required',
      ]),
    });
    expect(homolog).toMatchObject({
      valid: false,
      errors: ['externalCode must contain at most 160 characters'],
    });
    expect(oem).toMatchObject({
      valid: false,
      errors: ['Each brand must contain at most 160 characters'],
    });
  });

  it('rejects prototype-polluting CSV headers', () => {
    expect(() =>
      parseImportPayload({
        target: 'category',
        categoryCode: 'bearings',
        format: 'csv',
        idempotencyKey: 'meeting-0003',
        csv: 'sku,__proto__\n6202,value',
      }),
    ).toThrow('forbidden header');
  });
});
