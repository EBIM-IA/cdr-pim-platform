import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

/**
 * A node of the PIM's own product taxonomy.
 *
 * Explicitly independent of the Dynamics AX item group: the ERP classifies for accounting
 * and warehousing, the PIM classifies for finding and describing. Forcing one hierarchy to
 * serve both is what makes ERP-driven catalogues unusable for e-commerce.
 *
 * Legacy domain shape kept for compatibility. The active persisted taxonomy, repositories
 * and HTTP administration live in `catalog-schema`; new behavior belongs there.
 */
export interface CategorySnapshot {
  readonly id: Uuid;
  readonly parentId: Uuid | null;
  readonly slug: string;
  readonly name: string;
  /** Materialised path from the root, e.g. `rodamientos/rigidos-de-bolas`. */
  readonly path: string;
  readonly position: number;
}

export class Category {
  private constructor(
    readonly id: Uuid,
    readonly parentId: Uuid | null,
    readonly slug: string,
    readonly name: string,
    readonly path: string,
    readonly position: number,
  ) {}

  static createRoot(input: { name: string; slug: string; position?: number }): Category {
    const slug = normaliseSlug(input.slug);
    return new Category(newUuid(), null, slug, requireName(input.name), slug, input.position ?? 0);
  }

  createChild(input: { name: string; slug: string; position?: number }): Category {
    const slug = normaliseSlug(input.slug);
    return new Category(
      newUuid(),
      this.id,
      slug,
      requireName(input.name),
      `${this.path}/${slug}`,
      input.position ?? 0,
    );
  }

  get depth(): number {
    return this.path.split('/').length;
  }

  isDescendantOf(other: Category): boolean {
    return this.path.startsWith(`${other.path}/`);
  }

  toSnapshot(): CategorySnapshot {
    return {
      id: this.id,
      parentId: this.parentId,
      slug: this.slug,
      name: this.name,
      path: this.path,
      position: this.position,
    };
  }
}

function normaliseSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length === 0) throw new ValidationError('Category slug must not be blank');
  return slug;
}

function requireName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) throw new ValidationError('Category name must not be blank');
  return name;
}
