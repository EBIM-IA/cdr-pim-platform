import type { Uuid } from '@cdr/shared';

/** Published read projection for deterministic search over active applications. */
export interface ApplicationSearchReadModelPort {
  findActiveProductIds(
    query: string,
    limit: number,
    verifiedOnly?: boolean,
  ): Promise<readonly Uuid[]>;
}

export const APPLICATION_SEARCH_READ_MODEL = Symbol('ApplicationSearchReadModelPort');
