import type { Uuid } from '@cdr/shared';

/**
 * One attribute value attached to one product.
 *
 * `source` and `confidence` exist from the very first version on purpose: in a PIM fed by
 * ERP exports, supplier PDFs and AI extraction, "where did this value come from and how
 * much do we trust it?" decides whether a human has to review it before publication.
 *
 * Legacy shape kept for compatibility. Typed, versioned values and provenance are
 * persisted by `catalog-schema`.
 */
export const AttributeSource = {
  Manual: 'manual',
  Erp: 'erp',
  Import: 'import',
  DocumentExtraction: 'document_extraction',
  AiGenerated: 'ai_generated',
} as const;

export type AttributeSource = (typeof AttributeSource)[keyof typeof AttributeSource];

export interface ProductAttribute {
  readonly productId: Uuid;
  readonly attributeDefinitionId: Uuid;
  /** Canonical string form; typed interpretation is driven by the definition's dataType. */
  readonly value: string;
  readonly source: AttributeSource;
  /** [0,1]. Anything below the review threshold must not reach a sales channel unchecked. */
  readonly confidence: number;
  readonly updatedAt: Date;
}

export function requiresHumanReview(attribute: ProductAttribute, threshold = 0.8): boolean {
  return (
    attribute.source !== AttributeSource.Manual &&
    attribute.source !== AttributeSource.Erp &&
    attribute.confidence < threshold
  );
}
