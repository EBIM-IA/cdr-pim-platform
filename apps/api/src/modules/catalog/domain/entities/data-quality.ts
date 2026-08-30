import type { Uuid } from '@cdr/shared';

/**
 * How complete and trustworthy a product's information is.
 *
 * A PIM's real output is not "rows exist" but "rows are good enough to publish". Making
 * that measurable from day one is what turns 45k inherited SKU into a work queue instead
 * of an undifferentiated pile.
 *
 * NOT PERSISTED YET, and deliberately not scored: the weights and the pass threshold are a
 * business decision that Casa del Rulimán has to make. What is fixed here is the *shape* of
 * the answer, so the eventual rules have somewhere to live.
 */
export const QualityDimension = {
  /** Required fields for the product's category are present. */
  Completeness: 'completeness',
  /** Values conform to their attribute definitions (type, unit, allowed values). */
  Validity: 'validity',
  /** Enough imagery and documentation to sell the part. */
  Richness: 'richness',
  /** AI/extracted values have been confirmed by a human where required. */
  Verification: 'verification',
} as const;

export type QualityDimension = (typeof QualityDimension)[keyof typeof QualityDimension];

export interface QualityFinding {
  readonly dimension: QualityDimension;
  readonly code: string;
  readonly message: string;
  readonly blocksPublication: boolean;
}

export interface DataQuality {
  readonly productId: Uuid;
  /** [0,1] per dimension. */
  readonly scores: Readonly<Record<QualityDimension, number>>;
  readonly findings: readonly QualityFinding[];
  readonly evaluatedAt: Date;
}

export function blocksPublication(quality: DataQuality): boolean {
  return quality.findings.some((finding) => finding.blocksPublication);
}
