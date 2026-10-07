import { ValidationError } from '@cdr/shared';
import type { Uuid } from '@cdr/shared';

export const CatalogAttributeDataType = {
  Text: 'text',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  Enum: 'enum',
  Measurement: 'measurement',
} as const;

export type CatalogAttributeDataType =
  (typeof CatalogAttributeDataType)[keyof typeof CatalogAttributeDataType];

export const AttributeSourceAuthority = {
  Pim: 'pim',
  Erp: 'erp',
  Supplier: 'supplier',
  Calculated: 'calculated',
} as const;

export type AttributeSourceAuthority =
  (typeof AttributeSourceAuthority)[keyof typeof AttributeSourceAuthority];

export const AttributeValueSource = {
  Manual: 'manual',
  Erp: 'erp',
  Import: 'import',
  DocumentExtraction: 'document_extraction',
  AiGenerated: 'ai_generated',
} as const;

export type AttributeValueSource = (typeof AttributeValueSource)[keyof typeof AttributeValueSource];
export type CatalogAttributeValue = string | number | boolean;

export interface DynamicAttributeDefinition {
  readonly id: Uuid;
  readonly key: string;
  readonly label: string;
  readonly dataType: CatalogAttributeDataType;
  readonly unit: string | null;
  readonly allowedValues: readonly string[];
  readonly sourceAuthority: AttributeSourceAuthority;
}

export interface TemplateAttribute extends DynamicAttributeDefinition {
  readonly required: boolean;
  readonly replicable: boolean;
  readonly searchable: boolean;
  readonly includeInTechnicalSheet: boolean;
  readonly position: number;
  readonly permissions: {
    readonly edit: boolean;
    readonly import: boolean;
    readonly export: boolean;
  };
}

export interface DynamicCatalogSchema {
  readonly category: {
    readonly id: Uuid;
    readonly slug: string;
    readonly name: string;
  };
  readonly template: {
    readonly id: Uuid;
    readonly name: string;
    readonly version: number;
  };
  readonly attributes: readonly TemplateAttribute[];
}

export interface ProductAttributeCell {
  /** Null carries the version of a cleared value so a later edit cannot reset to version 0. */
  readonly value: CatalogAttributeValue | null;
  readonly version: number;
  readonly source: AttributeValueSource;
  readonly updatedAt: Date;
}

export interface CatalogGridProduct {
  readonly id: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  readonly status: string;
  readonly attributes: Readonly<Record<string, ProductAttributeCell>>;
}

export interface CatalogWorkbookColumn extends TemplateAttribute {
  readonly applicableTemplateIds: readonly Uuid[];
}

export type CatalogWorkbookCell =
  | { readonly applicable: false }
  | {
      readonly applicable: true;
      readonly value: CatalogAttributeValue | null;
      readonly version: number;
      readonly source: AttributeValueSource;
      readonly updatedAt: Date;
      readonly required: boolean;
      readonly permissions: { readonly edit: boolean; readonly export: boolean };
    };

export interface CatalogWorkbookProduct {
  readonly id: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly brand: string | null;
  readonly status: string;
  readonly updatedAt: Date;
  readonly category: { readonly id: Uuid; readonly name: string };
  readonly template: {
    readonly id: Uuid;
    readonly name: string;
    readonly version: number;
  };
  readonly providerCode: string | null;
  readonly unifiedCode: string | null;
  readonly applicationTypes: readonly string[];
  readonly completeness: number;
  readonly attributes: Readonly<Record<string, CatalogWorkbookCell>>;
}

export function validateAttributeValue(
  definition: DynamicAttributeDefinition,
  value: CatalogAttributeValue | null,
  required: boolean,
): void {
  if (value === null) {
    if (required) {
      throw new ValidationError('A required attribute cannot be cleared', {
        attributeKey: definition.key,
      });
    }
    return;
  }
  switch (definition.dataType) {
    case CatalogAttributeDataType.Text:
      if (typeof value !== 'string') invalidType(definition, 'string');
      break;
    case CatalogAttributeDataType.Enum:
      if (typeof value !== 'string') invalidType(definition, 'string');
      if (!definition.allowedValues.includes(value as string)) {
        throw new ValidationError('Attribute value is not in the allowed value list', {
          attributeKey: definition.key,
          allowedValues: definition.allowedValues,
        });
      }
      break;
    case CatalogAttributeDataType.Number:
    case CatalogAttributeDataType.Measurement:
      if (typeof value !== 'number' || !Number.isFinite(value)) invalidType(definition, 'number');
      break;
    case CatalogAttributeDataType.Boolean:
      if (typeof value !== 'boolean') invalidType(definition, 'boolean');
      break;
    case CatalogAttributeDataType.Date:
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
      ) {
        invalidType(definition, 'ISO date (YYYY-MM-DD)');
      }
      break;
  }
}

function invalidType(definition: DynamicAttributeDefinition, expected: string): never {
  throw new ValidationError('Attribute value does not match its definition', {
    attributeKey: definition.key,
    dataType: definition.dataType,
    expected,
  });
}
