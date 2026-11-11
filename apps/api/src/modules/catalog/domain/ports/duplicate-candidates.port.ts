export interface DuplicatePairCandidate {
  readonly productA: { id: string; sku: string; name: string; brand: string | null };
  readonly productB: { id: string; sku: string; name: string; brand: string | null };
  readonly evidence: string;
}
export interface DuplicateCandidatesPort {
  /** Conservative alerts only: an exact shared non-SKU identifier, never an automatic merge. */
  detect(): Promise<readonly DuplicatePairCandidate[]>;
}
export const DUPLICATE_CANDIDATES = Symbol('DuplicateCandidatesPort');
