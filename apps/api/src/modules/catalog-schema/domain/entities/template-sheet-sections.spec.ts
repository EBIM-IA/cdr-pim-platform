import { describe, expect, it } from 'vitest';
import { defaultAttributeSection, defaultTemplateSections } from './template-sheet-sections';
describe('designer template sections', () => {
  it('preserves the supplied industrial rigid-ball ordering and explicit performance assignments', () => {
    expect(defaultTemplateSections(true).map((section) => section.label)).toEqual([
      'Identificación del producto',
      'Características / Especificaciones',
      'Dimensiones',
      'Datos de rendimiento',
      'Documentos y activos',
      'Empaque',
    ]);
    expect(
      defaultAttributeSection(
        {
          key: 'cr_capacidad_de_carga_dinamica_radial_n',
          label: 'Carga',
          sourceAuthority: 'pim',
          dataType: 'measurement',
        },
        true,
      ),
    ).toBe('rend');
    expect(
      defaultAttributeSection(
        { key: 'codigo_ean', label: 'Código EAN', sourceAuthority: 'pim', dataType: 'text' },
        true,
      ),
    ).toBe('ident');
  });
});
