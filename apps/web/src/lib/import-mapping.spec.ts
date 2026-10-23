import { describe, expect, it } from 'vitest';

import {
  importFields,
  mapImportRecords,
  matchImportField,
  parseImportSource,
} from './import-mapping';

describe('import mapping', () => {
  it('parses CSV quoted delimiters and multiline cells without changing row data', () => {
    expect(
      parseImportSource('Grupo;Marca;Modelo\r\nA;"Toyota; Lexus";"Modelo\ncompleto"', 'csv'),
    ).toEqual([{ Grupo: 'A', Marca: 'Toyota; Lexus', Modelo: 'Modelo\ncompleto' }]);
  });
  it('maps canonical aliases and prevents duplicate destinations or missing required fields', () => {
    const fields = importFields.homologs;
    expect(matchImportField('codigo_homologo', fields)).toBe('externalCode');
    expect(() => mapImportRecords([], { A: 'unifiedCode', B: 'unifiedCode' }, fields)).toThrow(
      'una sola columna',
    );
    expect(() => mapImportRecords([], { A: 'unifiedCode' }, fields)).toThrow('obligatorios');
  });
  it('keeps only explicitly mapped live fields and rejects malformed headers', () => {
    expect(
      mapImportRecords(
        [{ Grupo: 'G1', OEM: 'X1', Marca: ['Toyota'], Omitida: 'dato' }],
        { Grupo: 'unifiedCode', OEM: 'oemCode', Marca: 'brands', Omitida: '' },
        importFields.oem,
      ),
    ).toEqual([{ unifiedCode: 'G1', oemCode: 'X1', brands: ['Toyota'] }]);
    expect(() => parseImportSource('Grupo,Grupo\na,b', 'csv')).toThrow('únicos');
    expect(() => parseImportSource('constructor,SKU\na,b', 'csv')).toThrow('válidos');
  });
});
