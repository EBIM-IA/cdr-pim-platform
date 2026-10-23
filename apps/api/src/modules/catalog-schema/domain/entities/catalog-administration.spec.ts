import { ValidationError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { assertTemplatePublicationSelection } from './catalog-administration';

describe('template publication identity', () => {
  it.each(['codigo_articulo', 'codigoArticulo', 'sku'])(
    'keeps %s selected for publication',
    (key) => {
      expect(() => assertTemplatePublicationSelection(key, false)).toThrow(ValidationError);
      expect(() => assertTemplatePublicationSelection(key, true)).not.toThrow();
      expect(() => assertTemplatePublicationSelection(key, undefined)).not.toThrow();
    },
  );

  it.each([
    'codigo_proveedor',
    'codigo_unificador',
    'marca',
    'categoria_principal',
    'sku_proveedor',
    'peso',
  ])('allows the selection of %s to be disabled independently of ERP authority', (key) => {
    expect(() => assertTemplatePublicationSelection(key, false)).not.toThrow();
  });
});
