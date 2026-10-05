import type { Uuid } from '@cdr/shared';

import type { ExternalHomolog } from '../entities/external-homolog';

export interface HomologProductMatch {
  readonly id: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  readonly status: string;
}

export interface EligibleHomologMatch {
  readonly homolog: ExternalHomolog;
  readonly products: readonly HomologProductMatch[];
}

export interface ExternalHomologRepositoryPort {
  findGroupByCode(code: string): Promise<{ id: Uuid; code: string } | null>;
  findById(id: Uuid): Promise<ExternalHomolog | null>;
  list(unifiedCode?: string, includeInactive?: boolean): Promise<ExternalHomolog[]>;
  searchEligible(externalCode: string): Promise<EligibleHomologMatch[]>;
  save(homolog: ExternalHomolog): Promise<void>;
}

export const EXTERNAL_HOMOLOG_REPOSITORY = Symbol('ExternalHomologRepositoryPort');
