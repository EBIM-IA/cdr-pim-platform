import { ValidationError, newUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import {
  AttributeSourceAuthority,
  CatalogAttributeDataType,
  validateAttributeValue,
} from './catalog-schema';

const definition = {
  id: newUuid(),
  key: 'diametro_interior',
  label: 'Diámetro interior',
  dataType: CatalogAttributeDataType.Measurement,
  unit: 'mm',
  allowedValues: [],
  sourceAuthority: AttributeSourceAuthority.Pim,
};

describe('dynamic attribute validation', () => {
  it('accepts values matching the declared type', () => {
    expect(() => validateAttributeValue(definition, 25, true)).not.toThrow();
  });

  it('rejects a value with the wrong type', () => {
    expect(() => validateAttributeValue(definition, '25', true)).toThrow(ValidationError);
  });

  it('enforces enum allowed values', () => {
    const enumDefinition = {
      ...definition,
      dataType: CatalogAttributeDataType.Enum,
      unit: null,
      allowedValues: ['abierto', 'sellado'],
    };
    expect(() => validateAttributeValue(enumDefinition, 'blindado', false)).toThrow(
      ValidationError,
    );
  });

  it('allows clearing optional attributes and protects required ones', () => {
    expect(() => validateAttributeValue(definition, null, false)).not.toThrow();
    expect(() => validateAttributeValue(definition, null, true)).toThrow(ValidationError);
  });
});
