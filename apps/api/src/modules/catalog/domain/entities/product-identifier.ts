import { ValidationError } from '@cdr/shared';

/**
 * The kinds of external code by which Casa del Rulimán knows a product.
 *
 * `erp_item_id` is the Dynamics AX item number. It is modelled as one identifier among
 * several — never as the primary key — which is precisely what lets the ERP be replaced
 * without touching the PIM (ADR-001).
 */
export const ProductIdentifierType = {
  Sku: 'sku',
  ErpItemId: 'erp_item_id',
  ManufacturerPartNumber: 'manufacturer_part_number',
  Ean: 'ean',
  Upc: 'upc',
  InternalLegacy: 'internal_legacy',
} as const;

export type ProductIdentifierType =
  (typeof ProductIdentifierType)[keyof typeof ProductIdentifierType];

const VALID_TYPES = new Set<string>(Object.values(ProductIdentifierType));

/** Immutable value object: two identifiers with the same type and value are the same thing. */
export class ProductIdentifier {
  private constructor(
    readonly type: ProductIdentifierType,
    readonly value: string,
  ) {}

  static create(type: string, value: string): ProductIdentifier {
    if (!VALID_TYPES.has(type)) {
      throw new ValidationError('Unsupported product identifier type', { type });
    }
    const normalised = value.trim();
    if (normalised.length === 0) {
      throw new ValidationError('Product identifier value must not be blank', { type });
    }
    if (normalised.length > 120) {
      throw new ValidationError('Product identifier value is too long', { type, max: 120 });
    }
    return new ProductIdentifier(type as ProductIdentifierType, normalised);
  }

  equals(other: ProductIdentifier): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return `${this.type}:${this.value}`;
  }
}
