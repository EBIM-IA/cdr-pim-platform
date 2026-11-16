import type {
  CatalogWorkbookProductDto,
  CatalogWorkbookResultDto,
  ProductAttributeSheetDto,
} from '@cdr/contracts';
import type { Product, ProductAttribute } from './types';
const shown = (value: string | number | boolean, unit?: string | null) =>
  `${typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value}${unit ? ` ${unit}` : ''}`;
const known = (value: string) => (value === 'No disponible en el contrato actual' ? '' : value);

/** Metadata and attributes come only from role-filtered catalog responses. */
export function productWithWorkbookEvidence(
  product: Product,
  row: CatalogWorkbookProductDto | undefined,
  workbook?: CatalogWorkbookResultDto,
): Product {
  if (!row || !workbook)
    return {
      ...product,
      category: known(product.category),
      application: known(product.application),
    };
  const attributes: ProductAttribute[] = workbook.columns.flatMap((column) => {
    const cell = row.attributes[column.key];
    const value = cell?.applicable ? cell.value : null;
    return value === null || value === undefined || value === ''
      ? []
      : [
          {
            key: column.key,
            label: column.label,
            rawValue: value,
            value: shown(value, column.unit),
            ...(column.unit ? { unit: column.unit } : {}),
          },
        ];
  });
  return {
    ...product,
    category: row.category?.name ?? '',
    application: row.applicationTypes.join(' · '),
    unifiedCode: row.unifiedCode ?? undefined,
    providerCode: row.providerCode ?? undefined,
    completeness: row.completeness,
    attributes,
  };
}
export function productWithSheetEvidence(
  product: Product,
  sheet: ProductAttributeSheetDto,
): Product {
  const visibleValue = (keys: string[]) => {
    const key = sheet.schema.columns.find((column) => keys.includes(column.key))?.key;
    const value = key ? sheet.product.attributes[key]?.value : null;
    return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  };
  return {
    ...product,
    category: sheet.schema.category.name,
    application: known(product.application),
    unifiedCode: visibleValue([
      'codigo_unificador',
      'codigoUnificador',
      'unified_code',
      'unifiedCode',
    ]),
    providerCode: visibleValue([
      'codigo_proveedor',
      'codigoProveedor',
      'provider_code',
      'providerCode',
    ]),
    attributes: sheet.schema.columns.flatMap((column) => {
      const value = sheet.product.attributes[column.key]?.value;
      return value === null || value === undefined || value === ''
        ? []
        : [
            {
              key: column.key,
              label: column.label,
              rawValue: value,
              value: shown(value, column.unit),
              ...(column.unit ? { unit: column.unit } : {}),
              required: column.required,
            },
          ];
    }),
  };
}
