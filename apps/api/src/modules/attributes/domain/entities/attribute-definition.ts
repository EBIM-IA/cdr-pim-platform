import { type Uuid, ValidationError } from '@cdr/shared';

/**
 * The catalogue-wide definition of an attribute: its key, its data type, its unit and its
 * allowed values. Product rows reference a definition rather than repeating a free-text
 * label, which is what makes filtering ("rodamientos con diámetro interior 25 mm")
 * possible at all.
 *
 * NOT PERSISTED YET — the attribute dictionary itself is a functional deliverable from
 * Casa del Rulimán and must not be invented here.
 */
export const AttributeDataType = {
  Text: 'text',
  Number: 'number',
  Boolean: 'boolean',
  Enum: 'enum',
  Measurement: 'measurement',
} as const;

export type AttributeDataType = (typeof AttributeDataType)[keyof typeof AttributeDataType];

export interface AttributeDefinition {
  readonly id: Uuid;
  /** Stable machine key, e.g. `inner_diameter`. Never localised. */
  readonly key: string;
  readonly label: string;
  readonly dataType: AttributeDataType;
  /** Required when `dataType` is `measurement`, e.g. `mm`. */
  readonly unit?: string;
  /** Required when `dataType` is `enum`. */
  readonly allowedValues?: readonly string[];
  readonly searchable: boolean;
}

export function validateDefinition(definition: AttributeDefinition): void {
  if (definition.dataType === AttributeDataType.Enum && !definition.allowedValues?.length) {
    throw new ValidationError('An enum attribute must declare its allowed values', {
      key: definition.key,
    });
  }
  if (definition.dataType === AttributeDataType.Measurement && !definition.unit) {
    throw new ValidationError('A measurement attribute must declare its unit', {
      key: definition.key,
    });
  }
}
