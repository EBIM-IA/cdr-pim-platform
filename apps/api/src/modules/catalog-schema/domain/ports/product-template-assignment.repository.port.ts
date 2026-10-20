import type { Uuid } from '@cdr/shared';

export interface ProductTemplateAssignment {
  readonly productId: Uuid;
  readonly category: {
    readonly id: Uuid;
    readonly slug: string;
    readonly name: string;
  };
  readonly template: {
    readonly id: Uuid;
    readonly variantKey: string;
    readonly name: string;
    readonly version: number;
  };
  readonly assignedAt: Date;
}

export type ReassignProductTemplateResult =
  | {
      readonly kind: 'updated';
      readonly previousTemplateId: Uuid;
      readonly assignment: ProductTemplateAssignment;
    }
  | { readonly kind: 'product_not_found' }
  | { readonly kind: 'template_not_found' }
  | { readonly kind: 'different_category' }
  | { readonly kind: 'version_conflict'; readonly currentTemplateId: Uuid };

export interface ProductTemplateAssignmentRepositoryPort {
  reassign(input: {
    readonly productId: Uuid;
    readonly templateId: Uuid;
    readonly expectedTemplateId: Uuid;
    /** Business roles used by the catalogue visibility policy. */
    readonly roles: readonly string[];
    readonly now: Date;
    readonly audit: {
      readonly actorId: string;
      readonly correlationId: string;
    };
  }): Promise<ReassignProductTemplateResult>;
}

export const PRODUCT_TEMPLATE_ASSIGNMENT_REPOSITORY = Symbol('ProductTemplateAssignmentRepository');
