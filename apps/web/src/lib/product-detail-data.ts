import type {
  AttributeSourceAuthority,
  AttributeValueSource,
  CatalogAttributeValue,
  ProductAttributeSheetDto,
} from '@cdr/contracts';

export interface DetailTechnicalAttribute {
  readonly sectionKey?: string | null;
  readonly sectionLabel?: string;
  readonly sectionNumber?: number;
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
  const sectionOrder = new Map(
    (sheet.schema.sections ?? []).map((section) => [section.key, section.position]),
  );
  return [...sheet.schema.columns]
    .sort(
      (left, right) =>
        (sectionOrder.get(left.sectionKey ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (sectionOrder.get(right.sectionKey ?? '') ?? Number.MAX_SAFE_INTEGER) ||
        left.position - right.position,
    )
    .map((column) => {
      const cell = sheet.product.attributes[column.key];
      return {
        sectionNumber: column.sectionKey
          ? [...(sheet.schema.sections ?? [])]
              .sort((a, b) => a.position - b.position)
              .findIndex((section) => section.key === column.sectionKey) + 1 || undefined
          : undefined,
        sectionKey: column.sectionKey,
        sectionLabel: sheet.schema.sections?.find((section) => section.key === column.sectionKey)
          ?.label,
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

/** Keeps configured ordering while preserving every role-authorized attribute exactly once. */
export function groupAttributesByTemplateSections<T extends { key: string }>(
  sheet: ProductAttributeSheetDto,
  attributes: readonly T[],
): Array<{ title: string; note: string; attributes: T[] }> {
  const sections = [...(sheet.schema.sections ?? [])].sort((a, b) => a.position - b.position);
  const columns = new Map(sheet.schema.columns.map((column) => [column.key, column]));
  const assigned = new Set(sections.map((section) => section.key));
  const groups = sections.map((section, index) => ({
    title: `${index + 1}. ${section.label}`,
    note: 'Sección definida por la plantilla',
    attributes: attributes.filter(
      (attribute) => columns.get(attribute.key)?.sectionKey === section.key,
    ),
  }));
  const remaining = attributes.filter(
    (attribute) => !assigned.has(columns.get(attribute.key)?.sectionKey ?? ''),
  );
  if (remaining.length)
    groups.push({
      title: `${sections.length + 1}. Otros atributos`,
      note: 'Atributos pendientes de asignar a una sección',
      attributes: remaining,
    });
  return groups.filter((group) => group.attributes.length > 0);
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
