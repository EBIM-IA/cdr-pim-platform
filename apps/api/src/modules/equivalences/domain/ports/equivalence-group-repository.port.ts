import type { Uuid } from '@cdr/shared';

import type { EquivalenceGroup } from '../entities/equivalence-group';

export interface EquivalenceGroupRepositoryPort {
  findById(id: Uuid): Promise<EquivalenceGroup | null>;
  findByCode(code: string): Promise<EquivalenceGroup | null>;
  /** Every group a product participates in — the N:N direction. */
  findByProductId(productId: Uuid): Promise<EquivalenceGroup[]>;
  save(group: EquivalenceGroup): Promise<void>;
}

export const EQUIVALENCE_GROUP_REPOSITORY = Symbol('EquivalenceGroupRepositoryPort');
