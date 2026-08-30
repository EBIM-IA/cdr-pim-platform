import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

import { ProductIdentifier, ProductIdentifierType } from './product-identifier';

/**
 * Information lifecycle of a product record *inside the PIM*.
 *
 * Note what this is NOT: it is not stock, price or commercial availability. Those remain
 * owned by Dynamics AX. `published` here means "the product information is complete enough
 * to be pushed to a sales channel".
 */
export const ProductStatus = {
  Draft: 'draft',
  InReview: 'in_review',
  Published: 'published',
  Archived: 'archived',
} as const;

export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export interface ProductSnapshot {
  readonly id: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly brand: string | null;
  readonly status: ProductStatus;
  readonly identifiers: readonly ProductIdentifier[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Aggregate root of the catalog module.
 *
 * Framework-free by construction: no decorators, no ORM types, no DTO shapes. Everything
 * it needs from the outside world arrives as plain data. This is what makes it testable
 * without a database and portable across whatever persistence we choose (ADR-002).
 */
export class Product {
  private readonly identifierList: ProductIdentifier[];

  private constructor(
    readonly id: Uuid,
    private skuValue: string,
    private nameValue: string,
    private descriptionValue: string | null,
    private brandValue: string | null,
    private statusValue: ProductStatus,
    identifiers: readonly ProductIdentifier[],
    readonly createdAt: Date,
    private updatedAtValue: Date,
  ) {
    this.identifierList = [...identifiers];
  }

  get sku(): string {
    return this.skuValue;
  }
  get name(): string {
    return this.nameValue;
  }
  get description(): string | null {
    return this.descriptionValue;
  }
  get brand(): string | null {
    return this.brandValue;
  }
  get status(): ProductStatus {
    return this.statusValue;
  }
  get updatedAt(): Date {
    return this.updatedAtValue;
  }
  get identifiers(): readonly ProductIdentifier[] {
    return [...this.identifierList];
  }

  /** Creates a brand-new draft product. Always starts in `draft`. */
  static create(input: {
    sku: string;
    name: string;
    description?: string | null;
    brand?: string | null;
    now: Date;
    id?: Uuid;
  }): Product {
    const sku = normaliseSku(input.sku);
    const name = requireText(input.name, 'name', 300);

    return new Product(
      input.id ?? newUuid(),
      sku,
      name,
      input.description?.trim() || null,
      input.brand?.trim() || null,
      ProductStatus.Draft,
      // A product's own SKU is also one of its identifiers, so identifier lookups do not
      // need a special case for it.
      [ProductIdentifier.create(ProductIdentifierType.Sku, sku)],
      input.now,
      input.now,
    );
  }

  /** Rebuilds an aggregate from persistence. Performs no business validation by design. */
  static rehydrate(snapshot: ProductSnapshot): Product {
    return new Product(
      snapshot.id,
      snapshot.sku,
      snapshot.name,
      snapshot.description,
      snapshot.brand,
      snapshot.status,
      snapshot.identifiers,
      snapshot.createdAt,
      snapshot.updatedAt,
    );
  }

  rename(name: string, now: Date): void {
    this.nameValue = requireText(name, 'name', 300);
    this.updatedAtValue = now;
  }

  describe(description: string | null, now: Date): void {
    this.descriptionValue = description?.trim() || null;
    this.updatedAtValue = now;
  }

  addIdentifier(identifier: ProductIdentifier, now: Date): void {
    if (this.identifierList.some((existing) => existing.equals(identifier))) return;
    if (
      identifier.type !== ProductIdentifierType.InternalLegacy &&
      this.identifierList.some((existing) => existing.type === identifier.type)
    ) {
      throw new ValidationError('Product already has an identifier of this type', {
        productId: this.id,
        type: identifier.type,
      });
    }
    this.identifierList.push(identifier);
    this.updatedAtValue = now;
  }

  /**
   * A product may only be published once its information is minimally usable by a sales
   * channel. This rule is intentionally weak for now — the real data-quality gate is a
   * functional decision still pending with Casa del Rulimán.
   */
  publish(now: Date): void {
    if (this.statusValue === ProductStatus.Archived) {
      throw new ValidationError('An archived product cannot be published', { productId: this.id });
    }
    if (!this.descriptionValue) {
      throw new ValidationError('A product requires a description before it can be published', {
        productId: this.id,
      });
    }
    this.statusValue = ProductStatus.Published;
    this.updatedAtValue = now;
  }

  archive(now: Date): void {
    this.statusValue = ProductStatus.Archived;
    this.updatedAtValue = now;
  }

  /** Text handed to the embedding provider. Kept in the domain because *what* represents a
   *  product semantically is a business decision, not an infrastructure one. */
  toEmbeddableText(): string {
    return [this.nameValue, this.brandValue, this.skuValue, this.descriptionValue]
      .filter((part): part is string => Boolean(part))
      .join('\n');
  }

  toSnapshot(): ProductSnapshot {
    return {
      id: this.id,
      sku: this.skuValue,
      name: this.nameValue,
      description: this.descriptionValue,
      brand: this.brandValue,
      status: this.statusValue,
      identifiers: this.identifiers,
      createdAt: this.createdAt,
      updatedAt: this.updatedAtValue,
    };
  }
}

function normaliseSku(raw: string): string {
  const sku = raw.trim().toUpperCase();
  if (sku.length === 0) throw new ValidationError('SKU must not be blank', { field: 'sku' });
  if (sku.length > 64) throw new ValidationError('SKU is too long', { field: 'sku', max: 64 });
  return sku;
}

function requireText(raw: string, field: string, max: number): string {
  const value = raw.trim();
  if (value.length === 0) throw new ValidationError(`"${field}" must not be blank`, { field });
  if (value.length > max) throw new ValidationError(`"${field}" is too long`, { field, max });
  return value;
}
