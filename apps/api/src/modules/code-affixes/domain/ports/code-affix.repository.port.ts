import type { Uuid } from '@cdr/shared';

import type {
  CodeAffix,
  CodeAffixKind,
  CodeAffixSource,
  CodeAffixStatus,
} from '../entities/code-affix';

export interface CodeAffixCriteria {
  readonly q?: string;
  readonly kind?: CodeAffixKind;
  readonly status?: CodeAffixStatus;
  readonly source?: CodeAffixSource;
  readonly includeInactive: boolean;
}

export type CodeAffixMutationResult =
  | { readonly kind: 'updated'; readonly value: CodeAffix }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'version_conflict'; readonly actualUpdatedAt: Date };

export interface CodeAffixRepositoryPort {
  list(criteria: CodeAffixCriteria): Promise<CodeAffix[]>;
  findById(id: Uuid): Promise<CodeAffix | null>;
  insert(rule: CodeAffix): Promise<void>;
  save(rule: CodeAffix, expectedUpdatedAt: Date): Promise<CodeAffixMutationResult>;
}

export const CODE_AFFIX_REPOSITORY = Symbol('CodeAffixRepositoryPort');
