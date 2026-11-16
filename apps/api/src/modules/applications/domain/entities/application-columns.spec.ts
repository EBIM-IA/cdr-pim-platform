import { ValidationError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';
import {
  validateApplicationColumns,
  validateApplicationAdditionalFields,
} from './application-columns';
import { parseImportPayload } from '../../../imports/application/parse-import-payload';
const columns = [
  {
    key: 'campo_cliente',
    label: 'Campo del cliente',
    header: 'Dato cliente',
    required: true,
    aliases: ['Dato adicional'],
  },
];
describe('customer application columns', () => {
  it('keeps the initial definition empty and rejects duplicate or reserved mappings', () => {
    expect(() => validateApplicationColumns([])).not.toThrow();
    expect(() => validateApplicationColumns(columns)).not.toThrow();
    expect(() => validateApplicationColumns([...columns, ...columns])).toThrow(ValidationError);
    expect(() =>
      validateApplicationColumns([{ ...columns[0]!, aliases: ['Marca Vehículo'] }]),
    ).toThrow(ValidationError);
  });
  it('recognizes configured import aliases and validates required values before confirmation', () => {
    const payload = {
      target: 'applications' as const,
      format: 'json' as const,
      idempotencyKey: 'customer-columns',
      records: [
        { unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux', 'Dato adicional': 'Confirmado' },
      ],
    };
    const [row] = parseImportPayload(payload, columns);
    expect(row).toMatchObject({ valid: true, data: { 'extra:campo_cliente': 'Confirmado' } });
    expect(
      parseImportPayload(
        { ...payload, records: [{ unifiedCode: 'D1672', make: 'Toyota', model: 'Hilux' }] },
        columns,
      )[0],
    ).toMatchObject({ valid: false, errors: ['Campo del cliente es obligatorio'] });
    expect(() =>
      validateApplicationAdditionalFields({ campo_cliente: 'Valor' }, columns),
    ).not.toThrow();
    expect(() => validateApplicationAdditionalFields({ otro: 'Valor' }, columns)).toThrow(
      ValidationError,
    );
    expect(() =>
      validateApplicationAdditionalFields({ campo_cliente: null }, columns, true),
    ).toThrow(ValidationError);
  });
});
