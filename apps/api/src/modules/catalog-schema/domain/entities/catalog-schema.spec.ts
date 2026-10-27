import { ValidationError, newUuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import {
  AttributeSourceAuthority,
  CatalogAttributeDataType,
  catalogAttributePermissionsForRoles,
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

describe('catalog attribute consultation permissions', () => {
  it.each([['COMPRAS'], ['VENTAS'], ['COMPRAS', 'VENTAS']])(
    'ignores stored mutation grants for %s',
    (...roles) => {
      expect(
        catalogAttributePermissionsForRoles({ edit: true, import: true, export: true }, roles),
      ).toEqual({ edit: false, import: false, export: true });
    },
  );

  it('retains administrator grants in mixed profiles without inventing template access', () => {
    expect(
      catalogAttributePermissionsForRoles({ edit: true, import: true, export: false }, [
        'ADMINISTRADOR',
        'COMPRAS',
      ]),
    ).toEqual({ edit: true, import: true, export: false });
    expect(
      catalogAttributePermissionsForRoles({ edit: false, import: false, export: false }, [
        'ADMINISTRADOR',
      ]),
    ).toEqual({ edit: false, import: false, export: false });
  });
});

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
