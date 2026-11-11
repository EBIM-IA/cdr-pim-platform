import type { CatalogGridProductDto, CatalogGridSchemaDto } from '@cdr/contracts';

import type { TabularData } from './tabular-export';

/** The first worksheet is directly consumable by the import wizard; metadata stays separate. */
export function buildCategoryImportWorkbook(
  schema: CatalogGridSchemaDto,
  products: readonly CatalogGridProductDto[],
  example = false,
): readonly TabularData[] {
  const columns = schema.columns.filter(
    (column) =>
      column.sourceAuthority === 'pim' && column.permissions.import && column.permissions.export,
  );
  if (!columns.length)
    throw new Error('Esta plantilla no tiene atributos autorizados para exportar e importar.');
  return [
    {
      sheetName: 'Datos',
      headers: ['codigo_articulo', ...columns.map((column) => column.key)],
      rows: example
        ? []
        : products.map((product) => [
            product.sku,
            ...columns.map((column) => product.attributes[column.key]?.value ?? ''),
          ]),
    },
    {
      sheetName: 'Instrucciones',
      headers: ['Paso', 'Instrucción'],
      rows: [
        [
          'Plantilla',
          `${schema.category.name} · ${schema.template.name} · v${schema.template.version}`,
        ],
        [
          '1',
          'Edita la primera hoja Datos. Conserva codigo_articulo como identificador del SKU. No cambies sus códigos.',
        ],
        [
          '2',
          'Puedes eliminar columnas completas para enviar solo los atributos que deseas cambiar. Conserva al menos un atributo.',
        ],
        [
          '3',
          'Una celda vacía conserva el valor actual. Escribe - para vaciar un atributo opcional.',
        ],
        ['4', 'No se pueden vaciar atributos obligatorios ni modificar datos gobernados por ERP.'],
        [
          '5',
          'Los atributos replicables se propagan al código unificador según las reglas de la plantilla.',
        ],
        [
          '6',
          'Usa Subir Excel completado, revisa el mapeo y la validación, y confirma la importación. La descarga no guarda cambios.',
        ],
        [
          'Alcance',
          'El archivo contiene los productos de esta plantilla que cumplen los filtros de la hoja, hasta 5 000 filas.',
        ],
      ],
    },
    {
      sheetName: 'Atributos',
      headers: [
        'Columna',
        'Nombre',
        'Tipo',
        'Unidad',
        'Obligatorio',
        'Replicable',
        'Valores permitidos',
      ],
      rows: columns.map((column) => [
        column.key,
        column.label,
        column.dataType,
        column.unit,
        column.required,
        column.replicable,
        column.allowedValues.join(' | '),
      ]),
    },
  ];
}
