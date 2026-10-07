import type {
  AttributeSourceAuthority,
  AttributeValueSource,
  CatalogAttributeValue,
  ProductAttributeSheetDto,
} from '@cdr/contracts';

export interface DetailTechnicalAttribute {
  readonly key: string;
  readonly label: string;
  readonly value: CatalogAttributeValue | null;
  readonly unit: string | null;
  readonly source: AttributeValueSource | null;
  readonly authority: AttributeSourceAuthority;
  readonly includeInTechnicalSheet: boolean;
  readonly canExport: boolean;
  readonly updatedAt: string | null;
}

/**
 * The API already filters columns by the actor's attribute visibility. The technical-sheet flag
 * describes export purpose and must not remove a visible attribute from the on-screen detail.
 */
export function technicalAttributesFromSheet(
  sheet: ProductAttributeSheetDto,
): DetailTechnicalAttribute[] {
  return [...sheet.schema.columns]
    .sort((left, right) => left.position - right.position)
    .map((column) => {
      const cell = sheet.product.attributes[column.key];
      return {
        key: column.key,
        label: column.label,
        value: cell?.value ?? null,
        unit: column.unit,
        source: cell?.source ?? null,
        authority: column.sourceAuthority,
        includeInTechnicalSheet: column.includeInTechnicalSheet,
        canExport: column.permissions.export,
        updatedAt: cell?.updatedAt ?? null,
      };
    });
}

export function unifiedCodeFromSheet(sheet: ProductAttributeSheetDto | null): string | undefined {
  if (!sheet) return undefined;
  const entry = Object.entries(sheet.product.attributes).find(([key]) =>
    ['codigo_unificador', 'codigoUnificador', 'unified_code', 'unifiedCode'].includes(key),
  );
  const value = entry?.[1].value;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
